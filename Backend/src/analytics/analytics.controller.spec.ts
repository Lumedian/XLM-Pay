import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PrivacyBudgetService } from './privacy-budget.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AnalyticsQueryDto, AnalyticsQueryType } from './dto/analytics-query.dto';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: AnalyticsService;
  let privacyBudgetService: PrivacyBudgetService;

  const mockAnalyticsService = {
    executeQuery: jest.fn(),
    getUserBudget: jest.fn(),
    getBudgetStatistics: jest.fn(),
  };

  const mockPrivacyBudgetService = {
    exportBudgetData: jest.fn(),
    resetUserBudgetManually: jest.fn(),
    adjustUserBudget: jest.fn(),
    getQueryHistory: jest.fn(),
  };

  const mockUser = {
    sub: 'test-user-id',
    roles: ['analyst'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
        {
          provide: PrivacyBudgetService,
          useValue: mockPrivacyBudgetService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    analyticsService = module.get<AnalyticsService>(AnalyticsService);
    privacyBudgetService = module.get<PrivacyBudgetService>(PrivacyBudgetService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('executeQuery', () => {
    it('should execute analytics query successfully', async () => {
      const query: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.AGGREGATE_COUNT,
        epsilon: 0.5,
      };

      const expectedResult = {
        queryId: 'query-123',
        result: { count: 102 },
        privacy: {
          epsilon: 0.5,
          noiseAdded: 2,
          isReliable: true,
          confidenceInterval: [95, 109],
        },
        metadata: {
          queryType: 'aggregate_count',
          timestamp: new Date(),
          dataSource: 'users',
          recordCount: 100,
        },
      };

      mockAnalyticsService.executeQuery.mockResolvedValue(expectedResult);

      const result = await controller.executeQuery({ user: mockUser }, query);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedResult);
      expect(result.message).toContain('successfully with differential privacy protection');
      expect(mockAnalyticsService.executeQuery).toHaveBeenCalledWith('test-user-id', query);
    });

    it('should handle query execution errors', async () => {
      const query: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.AGGREGATE_COUNT,
        epsilon: 0.5,
      };

      mockAnalyticsService.executeQuery.mockRejectedValue(new Error('Insufficient budget'));

      await expect(controller.executeQuery({ user: mockUser }, query)).rejects.toThrow('Query execution failed: Insufficient budget');
    });

    it('should handle bad request errors properly', async () => {
      const query: AnalyticsQueryDto = {
        queryType: AnalyticsQueryType.AGGREGATE_COUNT,
        epsilon: 0.5,
      };

      const error = new Error('Invalid epsilon');
      error.name = 'BadRequestException';
      mockAnalyticsService.executeQuery.mockRejectedValue(error);

      await expect(controller.executeQuery({ user: mockUser }, query)).rejects.toThrow('Invalid epsilon');
    });
  });

  describe('getUserBudget', () => {
    it('should return user budget information', async () => {
      const mockBudget = {
        userId: 'test-user-id',
        totalBudget: 1.0,
        usedBudget: 0.3,
        remainingBudget: 0.7,
        lastReset: new Date(),
        queries: [],
      };

      mockAnalyticsService.getUserBudget.mockResolvedValue(mockBudget);

      const result = await controller.getUserBudget({ user: mockUser });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockBudget);
      expect(result.message).toContain('retrieved successfully');
      expect(mockAnalyticsService.getUserBudget).toHaveBeenCalledWith('test-user-id');
    });

    it('should handle budget retrieval errors', async () => {
      mockAnalyticsService.getUserBudget.mockRejectedValue(new Error('User not found'));

      await expect(controller.getUserBudget({ user: mockUser })).rejects.toThrow('Failed to retrieve budget: User not found');
    });
  });

  describe('getBudgetStatistics', () => {
    it('should return budget statistics for admin', async () => {
      const mockStats = {
        totalUsers: 100,
        averageUsage: 0.4,
        totalConsumed: 40,
        usersNearLimit: 5,
        budgetDistribution: { low: 60, medium: 25, high: 10, critical: 5 },
      };

      mockAnalyticsService.getBudgetStatistics.mockResolvedValue(mockStats);

      const result = await controller.getBudgetStatistics();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockStats);
      expect(result.message).toContain('retrieved successfully');
      expect(mockAnalyticsService.getBudgetStatistics).toHaveBeenCalled();
    });

    it('should handle statistics retrieval errors', async () => {
      mockAnalyticsService.getBudgetStatistics.mockRejectedValue(new Error('Database error'));

      await expect(controller.getBudgetStatistics()).rejects.toThrow('Failed to retrieve statistics: Database error');
    });
  });

  describe('exportBudgetData', () => {
    it('should export budget data for admin', async () => {
      const mockExportData = [
        {
          userId: 'user1',
          totalBudget: 1.0,
          usedBudget: 0.2,
          remainingBudget: 0.8,
          queryCount: 5,
        },
        {
          userId: 'user2',
          totalBudget: 1.0,
          usedBudget: 0.5,
          remainingBudget: 0.5,
          queryCount: 12,
        },
      ];

      mockPrivacyBudgetService.exportBudgetData.mockResolvedValue(mockExportData);

      const result = await controller.exportBudgetData();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockExportData);
      expect(result.message).toContain('compliance reporting');
      expect(mockPrivacyBudgetService.exportBudgetData).toHaveBeenCalled();
    });

    it('should handle export errors', async () => {
      mockPrivacyBudgetService.exportBudgetData.mockRejectedValue(new Error('Export failed'));

      await expect(controller.exportBudgetData()).rejects.toThrow('Failed to export data: Export failed');
    });
  });

  describe('resetUserBudget', () => {
    it('should reset user budget for admin', async () => {
      const userId = 'test-user-id';

      mockPrivacyBudgetService.resetUserBudgetManually.mockResolvedValue(undefined);

      const result = await controller.resetUserBudget(userId);

      expect(result.success).toBe(true);
      expect(result.message).toContain(`Budget reset successfully for user ${userId}`);
      expect(mockPrivacyBudgetService.resetUserBudgetManually).toHaveBeenCalledWith(userId);
    });

    it('should handle reset errors', async () => {
      const userId = 'test-user-id';
      mockPrivacyBudgetService.resetUserBudgetManually.mockRejectedValue(new Error('User not found'));

      await expect(controller.resetUserBudget(userId)).rejects.toThrow('Failed to reset budget: User not found');
    });
  });

  describe('adjustUserBudget', () => {
    it('should adjust user budget for admin', async () => {
      const userId = 'test-user-id';
      const body = { totalBudget: 1.5 };

      mockPrivacyBudgetService.adjustUserBudget.mockResolvedValue(undefined);

      const result = await controller.adjustUserBudget(userId, body);

      expect(result.success).toBe(true);
      expect(result.message).toContain(`Budget adjusted successfully for user ${userId} to ${body.totalBudget}`);
      expect(mockPrivacyBudgetService.adjustUserBudget).toHaveBeenCalledWith(userId, body.totalBudget);
    });

    it('should validate budget amount', async () => {
      const userId = 'test-user-id';
      const body = { totalBudget: -0.5 };

      await expect(controller.adjustUserBudget(userId, body)).rejects.toThrow('Total budget must be between 0 and 2.0');
    });

    it('should handle adjustment errors', async () => {
      const userId = 'test-user-id';
      const body = { totalBudget: 1.5 };
      mockPrivacyBudgetService.adjustUserBudget.mockRejectedValue(new Error('Invalid user'));

      await expect(controller.adjustUserBudget(userId, body)).rejects.toThrow('Failed to adjust budget: Invalid user');
    });
  });

  describe('getQueryHistory', () => {
    it('should get query history for admin', async () => {
      const userId = 'test-user-id';
      const mockHistory = [
        {
          queryId: 'query-1',
          epsilon: 0.5,
          timestamp: new Date(),
          description: 'Cohort analysis query',
          status: 'completed',
        },
        {
          queryId: 'query-2',
          epsilon: 0.3,
          timestamp: new Date(),
          description: 'Count query',
          status: 'completed',
        },
      ];

      mockPrivacyBudgetService.getQueryHistory.mockResolvedValue(mockHistory);

      const result = await controller.getQueryHistory(userId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockHistory);
      expect(result.message).toContain('retrieved successfully');
      expect(mockPrivacyBudgetService.getQueryHistory).toHaveBeenCalledWith(userId, 50);
    });

    it('should handle history retrieval errors', async () => {
      const userId = 'test-user-id';
      mockPrivacyBudgetService.getQueryHistory.mockRejectedValue(new Error('History unavailable'));

      await expect(controller.getQueryHistory(userId)).rejects.toThrow('Failed to retrieve query history: History unavailable');
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when system is normal', async () => {
      const mockStats = {
        totalUsers: 100,
        averageUsage: 0.3,
        totalConsumed: 30,
        usersNearLimit: 5, // Less than 10% of total users
        budgetDistribution: { low: 60, medium: 25, high: 10, critical: 5 },
      };

      mockAnalyticsService.getBudgetStatistics.mockResolvedValue(mockStats);

      const result = await controller.getHealthStatus();

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('healthy');
      expect(result.data.message).toContain('operating normally');
      expect(result.data.totalUsers).toBe(100);
      expect(result.data.usersNearLimit).toBe(5);
    });

    it('should return warning status when many users are near limit', async () => {
      const mockStats = {
        totalUsers: 100,
        averageUsage: 0.8,
        totalConsumed: 80,
        usersNearLimit: 15, // More than 10% of total users
        budgetDistribution: { low: 20, medium: 25, high: 30, critical: 25 },
      };

      mockAnalyticsService.getBudgetStatistics.mockResolvedValue(mockStats);

      const result = await controller.getHealthStatus();

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('warning');
      expect(result.data.message).toContain('Warning: Many users are approaching');
    });

    it('should handle health check errors', async () => {
      mockAnalyticsService.getBudgetStatistics.mockRejectedValue(new Error('Health check failed'));

      await expect(controller.getHealthStatus()).rejects.toThrow('Failed to get health status: Health check failed');
    });
  });

  describe('getSupportedQueryTypes', () => {
    it('should return supported query types and guidelines', async () => {
      const result = await controller.getSupportedQueryTypes();

      expect(result.success).toBe(true);
      expect(result.data.queryTypes).toBeDefined();
      expect(result.data.queryTypes).toHaveLength(6);
      expect(result.data.timeGranularity).toEqual(['hourly', 'daily', 'weekly', 'monthly']);
      expect(result.data.epsilonGuidelines).toBeDefined();

      // Check specific query types
      const cohortType = result.data.queryTypes.find(t => t.type === 'cohort_analysis');
      expect(cohortType).toBeDefined();
      expect(cohortType.description).toContain('cohort');
      expect(cohortType.epsilonRange).toEqual([0.1, 1.0]);
      expect(cohortType.typicalEpsilon).toBe(0.5);

      // Check epsilon guidelines
      expect(result.data.epsilonGuidelines).toHaveProperty('0.1-0.2');
      expect(result.data.epsilonGuidelines).toHaveProperty('0.3-0.5');
      expect(result.data.epsilonGuidelines).toHaveProperty('0.6-1.0');
    });
  });
});
