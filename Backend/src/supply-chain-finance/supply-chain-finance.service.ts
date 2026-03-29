import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditAction } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { QueuePriorityDto } from '../transaction-queue/dto/transaction-queue.dto';
import { TransactionQueueService } from '../transaction-queue/transaction-queue.service';
import {
  BuyerApprovalDto,
  ConnectAccountingProviderDto,
  CreateDiscountAuctionDto,
  CreateSupplyChainInvoiceDto,
  DistributeWaterfallDto,
  HandleDefaultDto,
  ImportAccountingInvoiceDto,
  ListSupplyChainInvoicesQueryDto,
  PlaceAuctionBidDto,
  SupplyChainApprovalStatusDto,
  SupplyChainCollectionStatusDto,
  SupplyChainVerificationStatusDto,
  TokenizeInvoiceDto,
  VerifySupplyChainInvoiceDto,
} from './dto/supply-chain-finance.dto';

type ScfInvoice = any;
type ScfAuction = any;
type ScfBid = any;

@Injectable()
export class SupplyChainFinanceService {
  private readonly logger = new Logger(SupplyChainFinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly transactionQueueService: TransactionQueueService,
  ) {}

  async createInvoice(dto: CreateSupplyChainInvoiceDto) {
    await this.assertUserExists(dto.sellerUserId);
    if (dto.buyerUserId) {
      await this.assertUserExists(dto.buyerUserId);
    }

    const issueDate = new Date(dto.issueDate);
    const dueDate = new Date(dto.dueDate);
    if (dueDate <= issueDate) {
      throw new BadRequestException('dueDate must be after issueDate');
    }

    const draftInvoice = {
      tenantId: dto.tenantId ?? null,
      sellerUserId: dto.sellerUserId,
      buyerUserId: dto.buyerUserId ?? null,
      invoiceNumber: dto.invoiceNumber,
      debtorName: dto.debtorName,
      debtorEmail: dto.debtorEmail ?? null,
      amount: this.toFixedNumber(dto.amount, 2),
      currency: (dto.currency ?? 'USD').toUpperCase(),
      issueDate,
      dueDate,
      uploadedDocumentUrl: dto.uploadedDocumentUrl,
      documentHash: dto.documentHash ?? null,
      description: dto.description ?? null,
      metadata: dto.metadata ?? {},
      status: 'PENDING_VERIFICATION',
      verificationStatus: 'PENDING',
      buyerApprovalStatus: dto.buyerUserId ? 'PENDING' : 'APPROVED',
      complianceStatus: 'PENDING',
      accountingProvider: dto.accountingProvider ?? null,
      accountingReference: dto.accountingReference ?? null,
      externalInvoiceId: dto.externalInvoiceId ?? null,
    };

    const compliance = this.evaluateCompliance(draftInvoice);
    const risk = this.assessRisk({
      ...draftInvoice,
      verificationStatus: 'PENDING',
      buyerApprovalStatus: draftInvoice.buyerApprovalStatus,
      complianceStatus: compliance.status,
    });

    const invoice = await (this.prisma as any).supplyChainFinanceInvoice.create({
      data: {
        ...draftInvoice,
        complianceStatus: compliance.status,
        regulatoryFlags: compliance.flags,
        riskScore: risk.score,
        riskGrade: risk.grade,
        advanceRateBps: risk.advanceRateBps,
      },
      include: {
        verifications: true,
        auctions: true,
        waterfalls: true,
        collections: true,
      },
    });

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'SCF_INVOICE',
      entityId: invoice.id,
      userId: dto.sellerUserId,
      newState: invoice,
      metadata: {
        invoiceNumber: dto.invoiceNumber,
        accountingProvider: dto.accountingProvider,
      },
    });

    return {
      ...invoice,
      riskAssessment: risk,
      compliance,
    };
  }

  async listInvoices(query: ListSupplyChainInvoicesQueryDto = {}) {
    return (this.prisma as any).supplyChainFinanceInvoice.findMany({
      where: {
        sellerUserId: query.sellerUserId,
        buyerUserId: query.buyerUserId,
        verificationStatus: query.verificationStatus,
        buyerApprovalStatus: query.buyerApprovalStatus,
        ...(query.onlyOpen
          ? {
              status: {
                in: ['PENDING_VERIFICATION', 'VERIFIED', 'TOKENIZED', 'AUCTION_LIVE', 'FUNDED'],
              },
            }
          : {}),
      },
      include: {
        auctions: {
          include: {
            bids: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        waterfalls: true,
        collections: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInvoice(invoiceId: string) {
    const invoice = await (this.prisma as any).supplyChainFinanceInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        verifications: {
          orderBy: { createdAt: 'desc' },
        },
        auctions: {
          include: {
            bids: {
              orderBy: [{ discountRateBps: 'asc' }, { bidAmount: 'desc' }, { createdAt: 'asc' }],
            },
            winningBid: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        waterfalls: {
          orderBy: { createdAt: 'desc' },
        },
        collections: {
          orderBy: { openedAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Supply chain invoice ${invoiceId} not found`);
    }

    return invoice;
  }

  async verifyInvoice(invoiceId: string, dto: VerifySupplyChainInvoiceDto) {
    const invoice = await this.getInvoice(invoiceId);
    const verification = await (this.prisma as any).supplyChainInvoiceVerification.create({
      data: {
        invoiceId,
        status: dto.status,
        reviewerUserId: dto.reviewerUserId ?? null,
        notes: dto.notes ?? null,
        verificationData: dto.verificationData ?? null,
      },
    });

    const compliance = this.evaluateCompliance({
      ...invoice,
      verificationStatus: dto.status,
    });
    const risk = this.assessRisk({
      ...invoice,
      verificationStatus: dto.status,
      complianceStatus: compliance.status,
    });
    const nextStatus =
      dto.status === SupplyChainVerificationStatusDto.VERIFIED
        ? 'VERIFIED'
        : dto.status === SupplyChainVerificationStatusDto.MANUAL_REVIEW
          ? 'PENDING_VERIFICATION'
          : 'REJECTED';
    const updated = await (this.prisma as any).supplyChainFinanceInvoice.update({
      where: { id: invoiceId },
      data: {
        verificationStatus: dto.status,
        status: nextStatus,
        verifiedAt: dto.status === SupplyChainVerificationStatusDto.VERIFIED ? new Date() : null,
        complianceStatus: compliance.status,
        regulatoryFlags: compliance.flags,
        riskScore: risk.score,
        riskGrade: risk.grade,
        advanceRateBps: risk.advanceRateBps,
      },
    });

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'SCF_INVOICE_VERIFICATION',
      entityId: invoiceId,
      userId: dto.reviewerUserId ?? invoice.sellerUserId,
      previousState: {
        verificationStatus: invoice.verificationStatus,
        status: invoice.status,
      },
      newState: {
        verificationStatus: dto.status,
        status: nextStatus,
      },
      metadata: verification,
    });

    return updated;
  }

  async approveInvoiceByBuyer(invoiceId: string, dto: BuyerApprovalDto) {
    const invoice = await this.getInvoice(invoiceId);
    if (invoice.buyerUserId && dto.approverUserId && invoice.buyerUserId !== dto.approverUserId) {
      throw new BadRequestException('approverUserId must match the invoice buyer');
    }

    const compliance = this.evaluateCompliance({
      ...invoice,
      buyerApprovalStatus: dto.status,
    });
    const risk = this.assessRisk({
      ...invoice,
      buyerApprovalStatus: dto.status,
      complianceStatus: compliance.status,
    });

    const updated = await (this.prisma as any).supplyChainFinanceInvoice.update({
      where: { id: invoiceId },
      data: {
        buyerApprovalStatus: dto.status,
        approvedAt: dto.status === SupplyChainApprovalStatusDto.APPROVED ? new Date() : null,
        complianceStatus: compliance.status,
        regulatoryFlags: compliance.flags,
        riskScore: risk.score,
        riskGrade: risk.grade,
        advanceRateBps: risk.advanceRateBps,
        status:
          dto.status === SupplyChainApprovalStatusDto.REJECTED ? 'REJECTED' : invoice.status,
      },
    });

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'SCF_BUYER_APPROVAL',
      entityId: invoiceId,
      userId: dto.approverUserId ?? invoice.buyerUserId ?? invoice.sellerUserId,
      previousState: { buyerApprovalStatus: invoice.buyerApprovalStatus },
      newState: { buyerApprovalStatus: dto.status },
      metadata: { notes: dto.notes ?? null },
    });

    return updated;
  }

  async tokenizeInvoice(invoiceId: string, dto: TokenizeInvoiceDto = {}) {
    const invoice = await this.getInvoice(invoiceId);
    this.assertReadyForTokenization(invoice);

    const tokenId = invoice.nftTokenId || `scf-${invoice.id}`;
    const metadataUri =
      invoice.nftMetadataUri || `${dto.metadataBaseUri || 'ipfs://stellara-scf'}/${tokenId}.json`;

    const updated = await (this.prisma as any).supplyChainFinanceInvoice.update({
      where: { id: invoiceId },
      data: {
        nftTokenId: tokenId,
        nftMetadataUri: metadataUri,
        smartContractAddress:
          dto.smartContractAddress ||
          this.configService.get<string>('SCF_TOKEN_CONTRACT_ADDRESS', 'SCF_TOKENIZATION_SIM'),
        tokenizedAt: new Date(),
        status: 'TOKENIZED',
      },
    });

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'SCF_TOKENIZATION',
      entityId: invoiceId,
      userId: invoice.sellerUserId,
      previousState: { nftTokenId: invoice.nftTokenId, status: invoice.status },
      newState: { nftTokenId: tokenId, status: 'TOKENIZED' },
      metadata: { nftMetadataUri: metadataUri },
    });

    return updated;
  }

  async createAuction(invoiceId: string, dto: CreateDiscountAuctionDto) {
    const invoice = await this.getInvoice(invoiceId);
    if (invoice.status !== 'TOKENIZED') {
      throw new BadRequestException('Invoice must be tokenized before opening an auction');
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('Auction end time must be after start time');
    }

    const fundingTargetAmount =
      dto.fundingTargetAmount ?? (this.toNumber(invoice.amount) * this.toNumber(invoice.advanceRateBps)) / 10000;

    const auction = await (this.prisma as any).supplyChainDiscountAuction.create({
      data: {
        invoiceId,
        reserveDiscountBps: dto.reserveDiscountBps,
        minimumBidAmount: this.toFixedNumber(dto.minimumBidAmount ?? fundingTargetAmount * 0.25, 2),
        fundingTargetAmount: this.toFixedNumber(fundingTargetAmount, 2),
        startsAt,
        endsAt,
        status: startsAt <= new Date() ? 'LIVE' : 'DRAFT',
      },
      include: { bids: true },
    });

    await (this.prisma as any).supplyChainFinanceInvoice.update({
      where: { id: invoiceId },
      data: {
        status: auction.status === 'LIVE' ? 'AUCTION_LIVE' : invoice.status,
      },
    });

    return auction;
  }

  async placeBid(auctionId: string, dto: PlaceAuctionBidDto) {
    await this.assertUserExists(dto.investorUserId);
    const auction = await this.getAuction(auctionId);
    if (auction.status !== 'LIVE') {
      throw new BadRequestException('Auction is not live');
    }
    if (new Date(auction.endsAt) <= new Date()) {
      throw new BadRequestException('Auction has already ended');
    }
    if (dto.bidAmount < this.toNumber(auction.minimumBidAmount)) {
      throw new BadRequestException('Bid amount is below the auction minimum');
    }
    if (dto.discountRateBps > auction.reserveDiscountBps) {
      throw new BadRequestException('Discount rate exceeds reserve threshold');
    }

    const bid = await (this.prisma as any).supplyChainAuctionBid.create({
      data: {
        auctionId,
        investorUserId: dto.investorUserId,
        investorWallet: dto.investorWallet ?? null,
        discountRateBps: dto.discountRateBps,
        bidAmount: this.toFixedNumber(dto.bidAmount, 2),
        expectedYieldBps: dto.discountRateBps,
        metadata: dto.metadata ?? null,
      },
    });

    return {
      bid,
      leaderboard: await this.getBidLeaderboard(auctionId),
    };
  }

  async awardAuction(auctionId: string) {
    const auction = await this.getAuction(auctionId);
    if (!['LIVE', 'CLOSED', 'DRAFT'].includes(auction.status)) {
      throw new BadRequestException('Auction cannot be awarded from its current state');
    }

    const bids = await this.getBidLeaderboard(auctionId);
    if (bids.length === 0) {
      throw new BadRequestException('No bids available to award');
    }

    const winningBid = bids[0];
    await (this.prisma as any).supplyChainAuctionBid.updateMany({
      where: { auctionId, id: { not: winningBid.id } },
      data: { status: 'OUTBID' },
    });

    await (this.prisma as any).supplyChainAuctionBid.update({
      where: { id: winningBid.id },
      data: { status: 'WINNING' },
    });

    const updatedAuction = await (this.prisma as any).supplyChainDiscountAuction.update({
      where: { id: auctionId },
      data: {
        status: 'AWARDED',
        winningBidId: winningBid.id,
      },
      include: {
        winningBid: true,
        bids: true,
      },
    });

    await (this.prisma as any).supplyChainFinanceInvoice.update({
      where: { id: auction.invoiceId },
      data: {
        status: 'FUNDED',
        fundedAt: new Date(),
        financedAmount: winningBid.bidAmount,
        expectedYieldBps: winningBid.expectedYieldBps,
        reserveAmount: this.toFixedNumber(this.toNumber(auction.invoice.amount) - this.toNumber(winningBid.bidAmount), 2),
      },
    });

    return updatedAuction;
  }

  async distributePaymentWaterfall(invoiceId: string, dto: DistributeWaterfallDto) {
    const invoice = await this.getInvoice(invoiceId);
    const awardedAuction = invoice.auctions.find((auction: any) => auction.status === 'AWARDED');
    if (!awardedAuction?.winningBid) {
      throw new BadRequestException('Invoice requires an awarded auction before distribution');
    }

    const grossPaymentAmount = this.toFixedNumber(dto.grossPaymentAmount, 2);
    const servicingFeeAmount = this.calculateFee(grossPaymentAmount, dto.servicingFeeBps ?? 150);
    const platformFeeAmount = this.calculateFee(grossPaymentAmount, dto.platformFeeBps ?? 50);
    const daysOutstanding = Math.max(
      1,
      Math.ceil(
        (new Date(invoice.dueDate).getTime() - new Date(invoice.issueDate).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
    const investorYieldAmount = this.toFixedNumber(
      (this.toNumber(awardedAuction.winningBid.bidAmount) *
        awardedAuction.winningBid.expectedYieldBps *
        daysOutstanding) /
        3650000,
      2,
    );
    const investorPayoutAmount = this.toFixedNumber(
      Math.min(
        grossPaymentAmount - servicingFeeAmount - platformFeeAmount,
        this.toNumber(awardedAuction.winningBid.bidAmount) + investorYieldAmount,
      ),
      2,
    );
    const sellerResidualAmount = this.toFixedNumber(
      Math.max(0, grossPaymentAmount - servicingFeeAmount - platformFeeAmount - investorPayoutAmount),
      2,
    );

    const payload = {
      invoiceId,
      sellerUserId: invoice.sellerUserId,
      investorUserId: awardedAuction.winningBid.investorUserId,
      grossPaymentAmount,
      servicingFeeAmount,
      platformFeeAmount,
      investorPayoutAmount,
      sellerResidualAmount,
      tokenId: invoice.nftTokenId,
    };

    const queuedTransaction = await this.transactionQueueService.enqueue({
      signerAddress: this.configService.get<string>('SCF_SETTLEMENT_SIGNER', 'SCF_SETTLEMENT_SIGNER'),
      contractAddress: invoice.smartContractAddress ||
        this.configService.get<string>('SCF_SETTLEMENT_CONTRACT_ADDRESS', 'SCF_SETTLEMENT_SIM'),
      functionName: 'distributeInvoiceSettlement',
      payload,
      metadata: {
        invoiceId,
        auctionId: awardedAuction.id,
      },
      priority: QueuePriorityDto.HIGH,
      maxRetries: 5,
    });

    const waterfall = await (this.prisma as any).supplyChainPaymentWaterfall.create({
      data: {
        invoiceId,
        auctionId: awardedAuction.id,
        grossPaymentAmount,
        servicingFeeAmount,
        platformFeeAmount,
        investorPayoutAmount,
        sellerResidualAmount,
        status: 'DISTRIBUTED',
        distributionTransactionId: queuedTransaction.id,
        distributionPayload: payload,
      },
    });

    await (this.prisma as any).supplyChainFinanceInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'SETTLED',
        settledAt: new Date(),
      },
    });

    return {
      waterfall,
      queuedTransaction,
    };
  }

  async handleDefault(invoiceId: string, dto: HandleDefaultDto) {
    const invoice = await this.getInvoice(invoiceId);
    const recoveredAmount = this.toFixedNumber(dto.recoveredAmount ?? 0, 2);
    const outstandingAmount = this.toFixedNumber(Math.max(0, this.toNumber(invoice.amount) - recoveredAmount), 2);

    const collection = await (this.prisma as any).supplyChainCollectionCase.create({
      data: {
        invoiceId,
        status: dto.collectionStatus ?? SupplyChainCollectionStatusDto.OPEN,
        assignedAgency: dto.assignedAgency ?? null,
        outstandingAmount,
        recoveredAmount,
        notes: dto.notes ?? null,
      },
    });

    await (this.prisma as any).supplyChainFinanceInvoice.update({
      where: { id: invoiceId },
      data: {
        status:
          outstandingAmount > 0 ? 'COLLECTIONS' : 'DEFAULTED',
        defaultedAt: new Date(),
      },
    });

    const latestWaterfall = invoice.waterfalls[0];
    if (latestWaterfall) {
      await (this.prisma as any).supplyChainPaymentWaterfall.update({
        where: { id: latestWaterfall.id },
        data: {
          status: 'DEFAULTED',
        },
      });
    }

    return collection;
  }

  async connectAccountingProvider(dto: ConnectAccountingProviderDto) {
    await this.assertUserExists(dto.sellerUserId);

    return (this.prisma as any).supplyChainAccountingConnection.upsert({
      where: {
        sellerUserId_provider: {
          sellerUserId: dto.sellerUserId,
          provider: dto.provider,
        },
      },
      create: {
        tenantId: dto.tenantId ?? null,
        sellerUserId: dto.sellerUserId,
        provider: dto.provider,
        externalOrganizationId: dto.externalOrganizationId,
        credentials: dto.credentials ?? null,
        metadata: dto.metadata ?? null,
      },
      update: {
        tenantId: dto.tenantId ?? null,
        externalOrganizationId: dto.externalOrganizationId,
        credentials: dto.credentials ?? null,
        metadata: dto.metadata ?? null,
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      },
    });
  }

  async importInvoiceFromAccounting(dto: ImportAccountingInvoiceDto) {
    const connection = await (this.prisma as any).supplyChainAccountingConnection.findUnique({
      where: {
        sellerUserId_provider: {
          sellerUserId: dto.sellerUserId,
          provider: dto.provider,
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(`No ${dto.provider} connection found for seller ${dto.sellerUserId}`);
    }

    const invoice = await this.createInvoice({
      sellerUserId: dto.sellerUserId,
      invoiceNumber: dto.invoiceNumber,
      debtorName: dto.debtorName,
      debtorEmail: dto.debtorEmail,
      amount: dto.amount,
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      uploadedDocumentUrl:
        dto.uploadedDocumentUrl ||
        `https://accounting-import.local/${dto.provider.toLowerCase()}/invoices/${dto.externalInvoiceId}`,
      accountingProvider: dto.provider,
      accountingReference: connection.externalOrganizationId,
      externalInvoiceId: dto.externalInvoiceId,
      metadata: {
        ...(dto.metadata ?? {}),
        importedFromAccounting: true,
      },
    });

    await (this.prisma as any).supplyChainAccountingConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
      },
    });

    return invoice;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoCloseAuctions() {
    const expiredAuctions = await (this.prisma as any).supplyChainDiscountAuction.findMany({
      where: {
        status: 'LIVE',
        endsAt: {
          lte: new Date(),
        },
      },
      include: {
        bids: true,
      },
    });

    for (const auction of expiredAuctions) {
      try {
        if (auction.bids.length > 0) {
          await this.awardAuction(auction.id);
        } else {
          await (this.prisma as any).supplyChainDiscountAuction.update({
            where: { id: auction.id },
            data: { status: 'CLOSED' },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to auto-close auction ${auction.id}: ${error.message}`, error.stack);
      }
    }
  }

  private async getAuction(auctionId: string) {
    const auction = await (this.prisma as any).supplyChainDiscountAuction.findUnique({
      where: { id: auctionId },
      include: {
        invoice: true,
        winningBid: true,
        bids: true,
      },
    });
    if (!auction) {
      throw new NotFoundException(`Auction ${auctionId} not found`);
    }
    return auction;
  }

  private async getBidLeaderboard(auctionId: string) {
    return (this.prisma as any).supplyChainAuctionBid.findMany({
      where: {
        auctionId,
        status: {
          in: ['ACTIVE', 'WINNING'],
        },
      },
      orderBy: [{ discountRateBps: 'asc' }, { bidAmount: 'desc' }, { createdAt: 'asc' }],
    });
  }

  private evaluateCompliance(invoice: Partial<ScfInvoice>) {
    const metadata = (invoice.metadata || {}) as Record<string, any>;
    const flags: string[] = [];
    const jurisdiction = String(metadata.jurisdiction || 'US').toUpperCase();
    const amount = this.toNumber(invoice.amount);
    const tenorDays = Math.max(
      1,
      Math.ceil(
        (new Date(invoice.dueDate as Date).getTime() - new Date(invoice.issueDate as Date).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    if (!invoice.uploadedDocumentUrl) {
      flags.push('MISSING_INVOICE_DOCUMENT');
    }
    if (metadata.noticeOfAssignmentRequired !== false) {
      flags.push('NOTICE_OF_ASSIGNMENT_REQUIRED');
    }
    if (jurisdiction === 'US') {
      flags.push('UCC_ASSIGNMENT_REVIEW');
    }
    if (jurisdiction === 'NG') {
      flags.push('FACTORING_DISCLOSURE_REQUIRED');
    }
    if (amount > 250000 || tenorDays > 180) {
      flags.push('ELEVATED_EXPOSURE_REVIEW');
    }
    if (metadata.prohibitedAssignment === true) {
      return { status: 'FAILED', flags: [...flags, 'PROHIBITED_ASSIGNMENT'] };
    }
    if (invoice.buyerApprovalStatus === 'REJECTED') {
      return { status: 'FAILED', flags: [...flags, 'BUYER_REJECTED_ASSIGNMENT'] };
    }
    if (invoice.verificationStatus !== 'VERIFIED' || invoice.buyerApprovalStatus === 'PENDING') {
      return { status: 'NEEDS_REVIEW', flags };
    }

    return { status: 'PASSED', flags };
  }

  private assessRisk(invoice: Partial<ScfInvoice>) {
    const amount = this.toNumber(invoice.amount);
    const tenorDays = Math.max(
      1,
      Math.ceil(
        (new Date(invoice.dueDate as Date).getTime() - new Date(invoice.issueDate as Date).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    let score = 50;
    score += amount <= 25000 ? 15 : amount >= 250000 ? -15 : 0;
    score += tenorDays <= 45 ? 15 : tenorDays >= 120 ? -15 : 0;
    score += invoice.verificationStatus === 'VERIFIED' ? 10 : -10;
    score += invoice.buyerApprovalStatus === 'APPROVED' ? 10 : invoice.buyerApprovalStatus === 'REJECTED' ? -20 : -5;
    score += invoice.complianceStatus === 'PASSED' ? 10 : invoice.complianceStatus === 'FAILED' ? -30 : -10;

    score = Math.max(5, Math.min(95, score));

    let grade = 'C';
    let advanceRateBps = 8000;
    if (score >= 85) {
      grade = 'A';
      advanceRateBps = 9000;
    } else if (score >= 70) {
      grade = 'B';
      advanceRateBps = 8500;
    } else if (score >= 55) {
      grade = 'C';
      advanceRateBps = 8000;
    } else if (score >= 35) {
      grade = 'D';
      advanceRateBps = 7000;
    } else {
      grade = 'E';
      advanceRateBps = 6000;
    }

    return { score, grade, advanceRateBps };
  }

  private assertReadyForTokenization(invoice: ScfInvoice) {
    if (invoice.verificationStatus !== SupplyChainVerificationStatusDto.VERIFIED) {
      throw new BadRequestException('Invoice must be verified before tokenization');
    }
    if (invoice.buyerUserId && invoice.buyerApprovalStatus !== SupplyChainApprovalStatusDto.APPROVED) {
      throw new BadRequestException('Buyer approval is required before tokenization');
    }
    if (invoice.buyerApprovalStatus === SupplyChainApprovalStatusDto.REJECTED) {
      throw new BadRequestException('Rejected invoices cannot be tokenized');
    }
    if (invoice.complianceStatus === 'FAILED') {
      throw new BadRequestException('Invoice failed compliance checks');
    }
  }

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  private calculateFee(amount: number, bps: number) {
    return this.toFixedNumber((amount * bps) / 10000, 2);
  }

  private toFixedNumber(value: number, digits: number) {
    return Number(value.toFixed(digits));
  }

  private toNumber(value: any) {
    if (value === null || value === undefined) {
      return 0;
    }
    return Number(value);
  }
}
