import { Test, TestingModule } from '@nestjs/testing';
import { LongevityService } from './longevity.service';
import { ResearchAggregatorService } from './research-aggregator.service';
import { ClinicalTrialsService } from './clinical-trials.service';
import { PrismaService } from '../prisma.service';
import { DiscussionCategory } from '@prisma/client';

const mockPrisma = {
  longevityResearch: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  clinicalTrial: { count: jest.fn() },
  longevityMarket: { count: jest.fn() },
  expertLongevityRating: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  fundingAllocation: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  researchDiscussion: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  discussionReply: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockResearchAggregator = {
  syncFromPubMed: jest.fn().mockResolvedValue(10),
  syncFromBioRxiv: jest.fn().mockResolvedValue(5),
  syncFromMedRxiv: jest.fn().mockResolvedValue(3),
};

const mockClinicalTrials = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  syncTrials: jest.fn().mockResolvedValue(50),
};

describe('LongevityService', () => {
  let service: LongevityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LongevityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ResearchAggregatorService, useValue: mockResearchAggregator },
        { provide: ClinicalTrialsService, useValue: mockClinicalTrials },
      ],
    }).compile();

    service = module.get<LongevityService>(LongevityService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getStats', () => {
    it('should aggregate platform statistics across all models', async () => {
      mockPrisma.longevityResearch.count
        .mockResolvedValueOnce(150)
        .mockResolvedValueOnce(80);
      mockPrisma.clinicalTrial.count
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(40);
      mockPrisma.longevityMarket.count
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(18);
      mockPrisma.fundingAllocation.aggregate.mockResolvedValue({ _sum: { amount: 500000 } });
      mockPrisma.researchDiscussion.count.mockResolvedValue(350);

      const stats = await service.getStats();

      expect(stats.totalResearchPapers).toBe(150);
      expect(stats.openAccessPapers).toBe(80);
      expect(stats.totalClinicalTrials).toBe(120);
      expect(stats.activeTrials).toBe(40);
      expect(stats.totalMarkets).toBe(25);
      expect(stats.openMarkets).toBe(18);
      expect(stats.totalFundingAllocated).toBe('500000');
      expect(stats.totalDiscussions).toBe(350);
    });
  });

  describe('syncResearch', () => {
    it('should sync from all three sources and return total count', async () => {
      const result = await service.syncResearch();

      expect(mockResearchAggregator.syncFromPubMed).toHaveBeenCalledWith(100);
      expect(mockResearchAggregator.syncFromBioRxiv).toHaveBeenCalledWith(30);
      expect(mockResearchAggregator.syncFromMedRxiv).toHaveBeenCalledWith(30);
      expect(result.total).toBe(18);
      expect(result.synced.pubmed).toBe(10);
    });
  });

  describe('syncTrials', () => {
    it('should sync clinical trials and return count', async () => {
      const result = await service.syncTrials();
      expect(result.synced).toBe(50);
      expect(mockClinicalTrials.syncTrials).toHaveBeenCalled();
    });
  });

  describe('createDiscussion', () => {
    it('should create a discussion linked to a research paper', async () => {
      mockPrisma.longevityResearch.findUnique.mockResolvedValue({ id: 'res-1', title: 'Test' });
      mockPrisma.researchDiscussion.create.mockResolvedValue({
        id: 'disc-1',
        title: 'Debate: Are senolytics ready for clinical use?',
        content: 'Discussion content...',
        category: DiscussionCategory.DEBATE,
        authorId: 'user-1',
        researchId: 'res-1',
      });

      const result = await service.createDiscussion(
        {
          researchId: 'res-1',
          title: 'Debate: Are senolytics ready for clinical use?',
          content: 'Discussion content...',
          category: DiscussionCategory.DEBATE,
        },
        'user-1',
      );

      expect(result.category).toBe(DiscussionCategory.DEBATE);
      expect(mockPrisma.researchDiscussion.create).toHaveBeenCalled();
    });
  });

  describe('createExpertRating', () => {
    it('should create an expert rating and trigger impact score recalculation', async () => {
      mockPrisma.longevityResearch.findUnique.mockResolvedValue({ id: 'res-1' });
      mockPrisma.expertLongevityRating.create.mockResolvedValue({
        id: 'rating-1',
        researchId: 'res-1',
        expertName: 'Dr. David Sinclair',
        rating: 9,
        confidence: 85,
      });
      mockPrisma.expertLongevityRating.findMany.mockResolvedValue([
        { rating: 9, confidence: 85 },
      ]);
      mockPrisma.longevityResearch.update.mockResolvedValue({});

      const result = await service.createExpertRating({
        researchId: 'res-1',
        expertName: 'Dr. David Sinclair',
        institution: 'Harvard Medical School',
        rating: 9,
        confidence: 85,
      });

      expect(result.expertName).toBe('Dr. David Sinclair');
      expect(mockPrisma.longevityResearch.update).toHaveBeenCalled();
    });
  });
});
