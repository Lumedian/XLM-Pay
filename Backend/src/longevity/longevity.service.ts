import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { ResearchAggregatorService } from './research-aggregator.service';
import { ClinicalTrialsService } from './clinical-trials.service';
import {
  CreateExpertRatingDto,
  CreateFundingAllocationDto,
  CreateDiscussionDto,
  CreateReplyDto,
  ResearchQueryDto,
} from './dto';
import { FundingStatus } from '@prisma/client';
import { LongevityStats } from './interfaces/longevity.interfaces';

@Injectable()
export class LongevityService {
  private readonly logger = new Logger(LongevityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly researchAggregator: ResearchAggregatorService,
    private readonly clinicalTrials: ClinicalTrialsService,
  ) {}

  // ─── Research ──────────────────────────────────────────────────────────────

  async findAllResearch(query: ResearchQueryDto) {
    const page = parseInt(query.page ?? '1', 10);
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);

    const where: any = {};
    if (query.source) where.source = query.source;
    if (query.openAccess === 'true') where.isOpenAccess = true;
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { abstract: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.longevityResearch.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          expertRatings: { select: { rating: true, confidence: true } },
          _count: { select: { discussions: true, fundingAllocations: true } },
        },
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.longevityResearch.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOneResearch(id: string) {
    const paper = await this.prisma.longevityResearch.findUnique({
      where: { id },
      include: {
        expertRatings: true,
        fundingAllocations: {
          where: { status: FundingStatus.APPROVED },
        },
        discussions: {
          include: { replies: { take: 3 } },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!paper) throw new NotFoundException(`Research paper ${id} not found`);
    return paper;
  }

  /** Manually trigger a full sync from PubMed + bioRxiv + medRxiv */
  async syncResearch() {
    const [pubmedCount, biorxivCount, medrxivCount] = await Promise.all([
      this.researchAggregator.syncFromPubMed(100),
      this.researchAggregator.syncFromBioRxiv(30),
      this.researchAggregator.syncFromMedRxiv(30),
    ]);

    return {
      message: 'Research sync complete',
      synced: { pubmed: pubmedCount, biorxiv: biorxivCount, medrxiv: medrxivCount },
      total: pubmedCount + biorxivCount + medrxivCount,
    };
  }

  // ─── Clinical Trials ───────────────────────────────────────────────────────

  getTrials(filters: any) {
    return this.clinicalTrials.findAll(filters);
  }

  getTrial(id: string) {
    return this.clinicalTrials.findOne(id);
  }

  async syncTrials() {
    const count = await this.clinicalTrials.syncTrials();
    return { message: 'Clinical trials sync complete', synced: count };
  }

  // ─── Expert Ratings ────────────────────────────────────────────────────────

  async createExpertRating(dto: CreateExpertRatingDto) {
    const research = await this.prisma.longevityResearch.findUnique({
      where: { id: dto.researchId },
    });
    if (!research) throw new NotFoundException(`Research ${dto.researchId} not found`);

    const rating = await this.prisma.expertLongevityRating.create({
      data: {
        researchId: dto.researchId,
        expertName: dto.expertName,
        institution: dto.institution ?? null,
        rating: dto.rating,
        confidence: dto.confidence,
        commentary: dto.commentary ?? null,
      },
    });

    // Recalculate and update the paper's impact score
    await this.recalculateImpactScore(dto.researchId);
    return rating;
  }

  async getExpertRatings(researchId?: string) {
    const where = researchId ? { researchId } : {};
    return this.prisma.expertLongevityRating.findMany({
      where,
      include: { research: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Funding Allocations ───────────────────────────────────────────────────

  async createFundingAllocation(dto: CreateFundingAllocationDto, allocatorId: string) {
    const research = await this.prisma.longevityResearch.findUnique({
      where: { id: dto.researchId },
    });
    if (!research) throw new NotFoundException(`Research ${dto.researchId} not found`);

    return this.prisma.fundingAllocation.create({
      data: {
        researchId: dto.researchId,
        allocatorId,
        amount: dto.amount,
        currency: dto.currency ?? 'USD',
        rationale: dto.rationale ?? null,
        status: FundingStatus.PENDING,
      },
    });
  }

  async getFundingAllocations(researchId?: string) {
    const where = researchId ? { researchId } : {};
    return this.prisma.fundingAllocation.findMany({
      where,
      include: { research: { select: { title: true, source: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveFunding(id: string) {
    const allocation = await this.prisma.fundingAllocation.findUnique({ where: { id } });
    if (!allocation) throw new NotFoundException(`Funding allocation ${id} not found`);

    return this.prisma.fundingAllocation.update({
      where: { id },
      data: { status: FundingStatus.APPROVED },
    });
  }

  // ─── Community Discussions ─────────────────────────────────────────────────

  async createDiscussion(dto: CreateDiscussionDto, authorId: string) {
    if (dto.researchId) {
      const research = await this.prisma.longevityResearch.findUnique({
        where: { id: dto.researchId },
      });
      if (!research) throw new NotFoundException(`Research ${dto.researchId} not found`);
    }

    return this.prisma.researchDiscussion.create({
      data: {
        researchId: dto.researchId ?? null,
        authorId,
        title: dto.title,
        content: dto.content,
        category: dto.category,
      },
    });
  }

  async getDiscussions(researchId?: string, category?: string) {
    const where: any = {};
    if (researchId) where.researchId = researchId;
    if (category) where.category = category;

    return this.prisma.researchDiscussion.findMany({
      where,
      include: {
        research: { select: { title: true } },
        _count: { select: { replies: true } },
        replies: { take: 1, orderBy: { upvotes: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDiscussion(id: string) {
    const discussion = await this.prisma.researchDiscussion.findUnique({
      where: { id },
      include: {
        research: { select: { title: true, source: true, doi: true } },
        replies: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!discussion) throw new NotFoundException(`Discussion ${id} not found`);
    return discussion;
  }

  async createReply(discussionId: string, dto: CreateReplyDto, authorId: string) {
    const discussion = await this.prisma.researchDiscussion.findUnique({
      where: { id: discussionId },
    });
    if (!discussion) throw new NotFoundException(`Discussion ${discussionId} not found`);

    return this.prisma.discussionReply.create({
      data: { discussionId, authorId, content: dto.content },
    });
  }

  async upvoteDiscussion(id: string) {
    return this.prisma.researchDiscussion.update({
      where: { id },
      data: { upvotes: { increment: 1 } },
    });
  }

  async upvoteReply(id: string) {
    return this.prisma.discussionReply.update({
      where: { id },
      data: { upvotes: { increment: 1 } },
    });
  }

  // ─── Dashboard Stats ───────────────────────────────────────────────────────

  async getStats(): Promise<LongevityStats> {
    const [
      totalResearchPapers,
      openAccessPapers,
      totalClinicalTrials,
      activeTrials,
      totalMarkets,
      openMarkets,
      fundingResult,
      totalDiscussions,
    ] = await Promise.all([
      this.prisma.longevityResearch.count(),
      this.prisma.longevityResearch.count({ where: { isOpenAccess: true } }),
      this.prisma.clinicalTrial.count(),
      this.prisma.clinicalTrial.count({ where: { status: 'RECRUITING' } }),
      this.prisma.longevityMarket.count(),
      this.prisma.longevityMarket.count({ where: { status: 'OPEN' } }),
      this.prisma.fundingAllocation.aggregate({
        _sum: { amount: true },
        where: { status: FundingStatus.APPROVED },
      }),
      this.prisma.researchDiscussion.count(),
    ]);

    return {
      totalResearchPapers,
      openAccessPapers,
      totalClinicalTrials,
      activeTrials,
      totalMarkets,
      openMarkets,
      totalFundingAllocated: (fundingResult._sum.amount ?? 0).toString(),
      totalDiscussions,
    };
  }

  // ─── Scheduled jobs ────────────────────────────────────────────────────────

  /** Sync research papers weekly (Sunday 2 AM UTC) */
  @Cron('0 2 * * 0')
  async scheduledResearchSync() {
    this.logger.log('Running scheduled longevity research sync');
    await this.syncResearch();
  }

  /** Sync clinical trials daily (3 AM UTC) */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledTrialSync() {
    this.logger.log('Running scheduled clinical trial sync');
    await this.clinicalTrials.syncTrials();
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async recalculateImpactScore(researchId: string): Promise<void> {
    const ratings = await this.prisma.expertLongevityRating.findMany({
      where: { researchId },
      select: { rating: true, confidence: true },
    });

    if (!ratings.length) return;

    const avgRating =
      ratings.reduce((sum, r) => sum + r.rating * r.confidence, 0) /
      ratings.reduce((sum, r) => sum + r.confidence, 0);

    await this.prisma.longevityResearch.update({
      where: { id: researchId },
      data: { impactScore: Math.round(avgRating * 10) / 10 },
    });
  }
}
