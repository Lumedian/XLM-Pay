import { SupplyChainFinanceService } from './supply-chain-finance.service';

describe('SupplyChainFinanceService', () => {
  let service: SupplyChainFinanceService;
  let prisma: any;
  let auditService: any;
  let configService: any;
  let transactionQueueService: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      supplyChainFinanceInvoice: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      supplyChainInvoiceVerification: {
        create: jest.fn(),
      },
      supplyChainDiscountAuction: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      supplyChainAuctionBid: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      supplyChainPaymentWaterfall: {
        create: jest.fn(),
        update: jest.fn(),
      },
      supplyChainCollectionCase: {
        create: jest.fn(),
      },
      supplyChainAccountingConnection: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: jest.fn((key: string, fallback: string) => fallback),
    };

    transactionQueueService = {
      enqueue: jest.fn().mockResolvedValue({ id: 'queue-item-1' }),
    };

    service = new SupplyChainFinanceService(
      prisma,
      auditService,
      configService,
      transactionQueueService,
    );
  });

  it('creates invoices with compliance and risk metadata', async () => {
    prisma.supplyChainFinanceInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'inv-1', ...data }),
    );

    const result = await service.createInvoice({
      sellerUserId: 'user-1',
      buyerUserId: 'user-2',
      invoiceNumber: 'INV-100',
      debtorName: 'Acme Buyer',
      amount: 15000,
      issueDate: '2026-03-01T00:00:00.000Z',
      dueDate: '2026-04-15T00:00:00.000Z',
      uploadedDocumentUrl: 'https://files.test/invoice.pdf',
      metadata: { jurisdiction: 'US' },
    });

    expect(result.riskAssessment.grade).toBeTruthy();
    expect(result.compliance.flags).toContain('NOTICE_OF_ASSIGNMENT_REQUIRED');
    expect(prisma.supplyChainFinanceInvoice.create).toHaveBeenCalled();
  });

  it('awards the best bid using the lowest discount rate', async () => {
    prisma.supplyChainDiscountAuction.findUnique.mockResolvedValue({
      id: 'auction-1',
      invoiceId: 'inv-1',
      status: 'LIVE',
      invoice: { id: 'inv-1', amount: 10000 },
      bids: [],
      winningBid: null,
    });
    prisma.supplyChainAuctionBid.findMany.mockResolvedValue([
      { id: 'bid-2', discountRateBps: 700, bidAmount: 8500, expectedYieldBps: 700 },
      { id: 'bid-1', discountRateBps: 900, bidAmount: 9000, expectedYieldBps: 900 },
    ]);
    prisma.supplyChainDiscountAuction.update.mockResolvedValue({
      id: 'auction-1',
      status: 'AWARDED',
      winningBidId: 'bid-2',
      winningBid: { id: 'bid-2' },
      bids: [],
    });
    prisma.supplyChainFinanceInvoice.update.mockResolvedValue({});

    const result = await service.awardAuction('auction-1');

    expect(prisma.supplyChainAuctionBid.update).toHaveBeenCalledWith({
      where: { id: 'bid-2' },
      data: { status: 'WINNING' },
    });
    expect(result.winningBidId).toBe('bid-2');
  });

  it('distributes a payment waterfall through the transaction queue', async () => {
    prisma.supplyChainFinanceInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      sellerUserId: 'seller-1',
      nftTokenId: 'scf-inv-1',
      smartContractAddress: 'SCF_SETTLEMENT_SIM',
      issueDate: new Date('2026-03-01T00:00:00.000Z'),
      dueDate: new Date('2026-04-01T00:00:00.000Z'),
      waterfalls: [],
      auctions: [
        {
          id: 'auction-1',
          status: 'AWARDED',
          winningBid: {
            id: 'bid-1',
            investorUserId: 'investor-1',
            bidAmount: 8000,
            expectedYieldBps: 900,
          },
        },
      ],
      verifications: [],
      collections: [],
    });
    prisma.supplyChainPaymentWaterfall.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'wf-1', ...data }),
    );
    prisma.supplyChainFinanceInvoice.update.mockResolvedValue({});

    const result = await service.distributePaymentWaterfall('inv-1', {
      grossPaymentAmount: 10000,
      servicingFeeBps: 100,
      platformFeeBps: 50,
    });

    expect(transactionQueueService.enqueue).toHaveBeenCalled();
    expect(result.waterfall.status).toBe('DISTRIBUTED');
    expect(result.queuedTransaction.id).toBe('queue-item-1');
  });
});
