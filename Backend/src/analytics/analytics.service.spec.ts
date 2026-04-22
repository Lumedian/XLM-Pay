import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { DifferentialPrivacyService } from './differential-privacy.service';
import { PrivacyBudgetService } from './privacy-budget.service';
import { PrismaService } from '../prisma.service';
import { AnalyticsQueryDto, AnalyticsQueryType } from './dto/analytics-query.dto';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let differentialPrivacyService: DifferentialPrivacyService;
  let privacyBudgetService: PrivacyBudgetService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
    },
    project: {
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    contribution: {
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    privacyBudget: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    privacyBudgetQuery: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    analyticsCache: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockDifferentialPrivacyService = {
    privateCount: jest.fn(),
    privateSum: jest.fn(),
    privateAverage: jest.fn(),
    optimizeEpsilonAllocation: jest.fn(),
    calculateBudgetConsumption: jest.fn(),
  };

  const mockPrivacyBudgetService = {
    hasSufficientBudget: jest.fn(),
    reserveBudget: jest.fn(),
    confirmBudgetUsage: jest.fn(),
    releaseBudget: jest.fn(),
    getUserBudget: jest.fn(),
    getBudgetStatistics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: DifferentialPrivacyService,
          useValue: mockDifferentialPrivacyService,
        },
        {
          provide: PrivacyBudgetService,
          useValue: mockPrivacyBudgetService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    differentialPrivacyService = module.get<DifferentialPrivacyService>(DifferentialPrivacyService);
    privacyBudgetService = module.get<PrivacyBudgetService>(PrivacyBudgetService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeQuery', () => {
    const userId = 'test-user';
    const validQuery: AnalyticsQueryDto = {
      queryType: AnalyticsQueryType.AGGREGATE_COUNT,
      epsilon: 0.5,
    };

    it('should execute a simple count query successfully', async () => {
      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      mockPrismaService.user.count.mockResolvedValue(100);
      mockDifferentialPrivacyService.privateCount.mockReturnValue({
        value: 102,
        noiseAdded: 2,
        isReliable: true,
        confidenceInterval: [95, 109],
      });

      const result = await service.executeQuery(userId, validQuery);

      expect(result).toHaveProperty('queryId', 'query-id');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('privacy');
      expect(result).toHaveProperty('metadata');
      expect(result.privacy.epsilon).toBe(0.5);
      expect(result.metadata.recordCount).toBe(100);
      expect(mockPrivacyBudgetService.confirmBudgetUsage).toHaveBeenCalledWith('query-id');
    });

    it('should reject queries with insufficient budget', async () => {
      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(false);

      await expect(service.executeQuery(userId, validQuery)).rejects.toThrow('Insufficient privacy budget');
    });

    it('should reject queries with invalid epsilon', async () => {
      const invalidQuery = { ...validQuery, epsilon: 0.05 };

      await expect(service.executeQuery(userId, invalidQuery)).rejects.toThrow('Epsilon must be between 0.1 and 1.0');
    });

    it('should release budget on query failure', async () => {
      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      mockPrismaService.user.count.mockRejectedValue(new Error('Database error'));

      await expect(service.executeQuery(userId, validQuery)).rejects.toThrow();
      expect(mockPrivacyBudgetService.releaseBudget).toHaveBeenCalledWith('query-id');
    });
  });

  describe('cohort analysis', () => {
    it('should execute cohort analysis with differential privacy', async () => {
      const userId = 'test-user';
      const cohortQuery: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.COHORT_ANALYSIS,
        epsilon: 0.6,
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      };

      const mockUsers = [
        { id: '1', createdAt: new Date('2024-01-01'), reputationScore: 100, trustScore: 500 },
        { id: '2', createdAt: new Date('2024-01-01'), reputationScore: 150, trustScore: 600 },
        { id: '3', createdAt: new Date('2024-01-08'), reputationScore: 200, trustScore: 550 },
      ];

      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockDifferentialPrivacyService.privateCount.mockReturnValue({
        value: 3,
        noiseAdded: 0.5,
        isReliable: true,
      });
      mockDifferentialPrivacyService.privateAverage.mockReturnValue({
        value: 150,
        noiseAdded: 5,
        isReliable: true,
      });

      const result = await service.executeQuery(userId, cohortQuery);

      expect(result.metadata.queryType).toBe('cohort_analysis');
      expect(result.result).toBeDefined();
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        },
        select: {
          id: true,
          createdAt: true,
          reputationScore: true,
          trustScore: true,
        },
      });
    });
  });

  describe('funnel analysis', () => {
    it('should execute funnel analysis with differential privacy', async () => {
      const userId = 'test-user';
      const funnelQuery: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.FUNNEL_ANALYSIS,
        epsilon: 0.4,
      };

      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      
      // Mock funnel step data
      mockPrismaService.user.findMany.mockResolvedValue([{ id: '1' }, { id: '2' }]);
      mockPrismaService.project.groupBy.mockResolvedValue([{ creatorId: '1' }]);
      mockPrismaService.contribution.groupBy
        .mockResolvedValueOnce([{ investorId: '1' }])
        .mockResolvedValueOnce([{ investorId: '1' }, { investorId: '2' }]);

      mockDifferentialPrivacyService.privateCount.mockReturnValue({
        value: 2,
        noiseAdded: 0.3,
        isReliable: true,
      });

      const result = await service.executeQuery(userId, funnelQuery);

      expect(result.metadata.queryType).toBe('funnel_analysis');
      expect(result.result.funnel).toBeDefined();
      expect(result.result.funnel).toHaveLength(4); // 4 funnel steps
    });
  });

  describe('retention analysis', () => {
    it('should execute retention analysis with differential privacy', async () => {
      const userId = 'test-user';
      const retentionQuery: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.RETENTION_ANALYSIS,
        epsilon: 0.6,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const mockCohortUsers = [
        { id: '1', createdAt: new Date('2024-01-01') },
        { id: '2', createdAt: new Date('2024-01-01') },
      ];

      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      mockPrismaService.user.findMany.mockResolvedValue(mockCohortUsers);
      mockPrismaService.project.count.mockResolvedValue(1);
      mockPrismaService.contribution.count.mockResolvedValue(1);
      mockDifferentialPrivacyService.privateCount.mockReturnValue({
        value: 1,
        noiseAdded: 0.2,
        isReliable: true,
      });

      const result = await service.executeQuery(userId, retentionQuery);

      expect(result.metadata.queryType).toBe('retention_analysis');
      expect(result.result.retention).toBeDefined();
      expect(result.result.retention).toHaveLength(3); // 1, 7, 30 day periods
    });
  });

  describe('aggregate queries', () => {
    it('should execute aggregate sum query', async () => {
      const userId = 'test-user';
      const sumQuery: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.AGGREGATE_SUM,
        epsilon: 0.3,
      };

      const mockUsers = [
        { reputationScore: 100 },
        { reputationScore: 200 },
        { reputationScore: 150 },
      ];

      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockDifferentialPrivacyService.privateSum.mockReturnValue({
        value: 455,
        noiseAdded: 5,
        isReliable: true,
        confidenceInterval: [445, 465],
      });

      const result = await service.executeQuery(userId, sumQuery);

      expect(result.result.sum).toBe(455);
      expect(result.privacy.noiseAdded).toBe(5);
      expect(result.metadata.recordCount).toBe(3);
    });

    it('should execute aggregate average query', async () => {
      const userId = 'test-user';
      const avgQuery: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.AGGREGATE_AVERAGE,
        epsilon: 0.4,
      };

      const mockUsers = [
        { reputationScore: 100 },
        { reputationScore: 200 },
        { reputationScore: 150 },
      ];

      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockDifferentialPrivacyService.privateAverage.mockReturnValue({
        value: 150,
        noiseAdded: 3,
        isReliable: true,
        confidenceInterval: [147, 153],
      });

      const result = await service.executeQuery(userId, avgQuery);

      expect(result.result.average).toBe(150);
      expect(result.privacy.noiseAdded).toBe(3);
      expect(result.metadata.recordCount).toBe(3);
    });
  });

  describe('budget management', () => {
    it('should get user budget information', async () => {
      const userId = 'test-user';
      const mockBudget = {
        userId,
        totalBudget: 1.0,
        usedBudget: 0.3,
        remainingBudget: 0.7,
        lastReset: new Date(),
        queries: [],
      };

      mockPrivacyBudgetService.getUserBudget.mockResolvedValue(mockBudget);

      const result = await service.getUserBudget(userId);

      expect(result).toEqual(mockBudget);
      expect(mockPrivacyBudgetService.getUserBudget).toHaveBeenCalledWith(userId);
    });

    it('should get budget statistics for admin', async () => {
      const mockStats = {
        totalUsers: 100,
        averageUsage: 0.4,
        totalConsumed: 40,
        usersNearLimit: 5,
        budgetDistribution: { low: 60, medium: 25, high: 10, critical: 5 },
      };

      mockPrivacyBudgetService.getBudgetStatistics.mockResolvedValue(mockStats);

      const result = await service.getBudgetStatistics();

      expect(result).toEqual(mockStats);
      expect(mockPrivacyBudgetService.getBudgetStatistics).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle unsupported query types', async () => {
      const userId = 'test-user';
      const invalidQuery: AnalyticsQueryDto = {
        queryType: 'unsupported' as any,
        epsilon: 0.5,
      };

      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');

      await expect(service.executeQuery(userId, invalidQuery)).rejects.toThrow('Unsupported query type');
    });

    it('should handle database errors gracefully', async () => {
      const userId = 'test-user';
      const query: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.AGGREGATE_COUNT,
        epsilon: 0.5,
      };

      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      mockPrismaService.user.count.mockRejectedValue(new Error('Connection failed'));

      await expect(service.executeQuery(userId, query)).rejects.toThrow();
      expect(mockPrivacyBudgetService.releaseBudget).toHaveBeenCalledWith('query-id');
    });
  });

  describe('data filtering and grouping', () => {
    it('should apply date filters correctly', async () => {
      const userId = 'test-user';
      const query: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.AGGREGATE_COUNT,
        epsilon: 0.5,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      mockPrismaService.user.count.mockResolvedValue(100);
      mockDifferentialPrivacyService.privateCount.mockReturnValue({
        value: 102,
        noiseAdded: 2,
        isReliable: true,
      });

      await service.executeQuery(userId, query);

      expect(mockPrismaService.user.count).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        },
      });
    });

    it('should apply field filters correctly', async () => {
      const userId = 'test-user';
      const query: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.AGGREGATE_COUNT,
        epsilon: 0.5,
        filterField: 'status',
        filterValue: 'active',
      };

      mockPrivacyBudgetService.hasSufficientBudget.mockResolvedValue(true);
      mockPrivacyBudgetService.reserveBudget.mockResolvedValue('query-id');
      mockPrismaService.user.count.mockResolvedValue(50);
      mockDifferentialPrivacyService.privateCount.mockReturnValue({
        value: 51,
        noiseAdded: 1,
        isReliable: true,
      });

      await service.executeQuery(userId, query);

      expect(mockPrismaService.user.count).toHaveBeenCalledWith({
        where: {
          status: 'active',
        },
      });
    });
  });
});
