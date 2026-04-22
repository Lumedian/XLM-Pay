import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DifferentialPrivacyService, DifferentialPrivacyResult } from './differential-privacy.service';
import { PrivacyBudgetService } from './privacy-budget.service';
import { AnalyticsQueryDto, AnalyticsQueryType, TimeGranularity } from './dto/analytics-query.dto';
import * as moment from 'moment';

export interface AnalyticsResult {
  queryId: string;
  result: any;
  privacy: {
    epsilon: number;
    noiseAdded: number;
    isReliable: boolean;
    confidenceInterval?: [number, number];
  };
  metadata: {
    queryType: string;
    timestamp: Date;
    dataSource: string;
    recordCount: number;
  };
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly differentialPrivacyService: DifferentialPrivacyService,
    private readonly privacyBudgetService: PrivacyBudgetService,
  ) {}

  /**
   * Execute privacy-preserving analytics query
   */
  async executeQuery(userId: string, query: AnalyticsQueryDto): Promise<AnalyticsResult> {
    // Validate epsilon
    if (query.epsilon < 0.1 || query.epsilon > 1.0) {
      throw new BadRequestException('Epsilon must be between 0.1 and 1.0');
    }

    // Check privacy budget
    const hasBudget = await this.privacyBudgetService.hasSufficientBudget(userId, query.epsilon);
    if (!hasBudget) {
      throw new BadRequestException('Insufficient privacy budget');
    }

    // Reserve budget
    const queryId = await this.privacyBudgetService.reserveBudget(
      userId,
      query.epsilon,
      `${query.queryType} query`
    );

    try {
      let result: any;
      let recordCount = 0;

      // Execute query based on type
      switch (query.queryType) {
        case AnalyticsQueryType.COHORT_ANALYSIS:
          result = await this.executeCohortAnalysis(query);
          break;
        case AnalyticsQueryType.FUNNEL_ANALYSIS:
          result = await this.executeFunnelAnalysis(query);
          break;
        case AnalyticsQueryType.RETENTION_ANALYSIS:
          result = await this.executeRetentionAnalysis(query);
          break;
        case AnalyticsQueryType.AGGREGATE_COUNT:
          result = await this.executeAggregateCount(query);
          recordCount = result.rawCount;
          break;
        case AnalyticsQueryType.AGGREGATE_SUM:
          result = await this.executeAggregateSum(query);
          recordCount = result.rawCount;
          break;
        case AnalyticsQueryType.AGGREGATE_AVERAGE:
          result = await this.executeAggregateAverage(query);
          recordCount = result.rawCount;
          break;
        default:
          throw new BadRequestException(`Unsupported query type: ${query.queryType}`);
      }

      // Confirm budget usage
      await this.privacyBudgetService.confirmBudgetUsage(queryId);

      return {
        queryId,
        result: result.processedResult,
        privacy: {
          epsilon: query.epsilon,
          noiseAdded: result.noiseAdded,
          isReliable: result.isReliable,
          confidenceInterval: result.confidenceInterval,
        },
        metadata: {
          queryType: query.queryType,
          timestamp: new Date(),
          dataSource: query.dataSource || 'users',
          recordCount: recordCount || result.recordCount || 0,
        },
      };
    } catch (error) {
      // Release budget on failure
      await this.privacyBudgetService.releaseBudget(queryId);
      throw error;
    }
  }

  /**
   * Cohort analysis with differential privacy
   */
  private async executeCohortAnalysis(query: AnalyticsQueryDto): Promise<any> {
    const startDate = query.startDate ? moment(query.startDate).toDate() : moment().subtract(90, 'days').toDate();
    const endDate = query.endDate ? moment(query.endDate).toDate() : new Date();

    // Get user cohorts based on registration date
    const cohorts = await this.prisma.user.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        createdAt: true,
        reputationScore: true,
        trustScore: true,
      },
    });

    // Group by week of registration
    const cohortGroups = this.groupByWeek(cohorts, 'createdAt');
    
    // Apply differential privacy to each cohort
    const privateCohorts = {};
    let totalNoiseAdded = 0;
    let isReliable = true;

    for (const [week, users] of Object.entries(cohortGroups)) {
      const cohortSize = users.length;
      const avgReputation = users.reduce((sum, user) => sum + user.reputationScore, 0) / cohortSize;
      const avgTrust = users.reduce((sum, user) => sum + user.trustScore, 0) / cohortSize;

      // Split epsilon between metrics
      const epsilonPerMetric = query.epsilon / 3;

      const privateSize = this.differentialPrivacyService.privateCount(cohortSize, epsilonPerMetric);
      const privateReputation = this.differentialPrivacyService.privateAverage(
        avgReputation,
        cohortSize,
        epsilonPerMetric,
        [0, 1000]
      );
      const privateTrust = this.differentialPrivacyService.privateAverage(
        avgTrust,
        cohortSize,
        epsilonPerMetric,
        [0, 1000]
      );

      totalNoiseAdded += Math.abs(privateSize.noiseAdded) + Math.abs(privateReputation.noiseAdded) + Math.abs(privateTrust.noiseAdded);
      isReliable = isReliable && privateSize.isReliable && privateReputation.isReliable && privateTrust.isReliable;

      privateCohorts[week] = {
        size: privateSize.value,
        avgReputation: privateReputation.value,
        avgTrust: privateTrust.value,
        rawSize: cohortSize,
        rawAvgReputation: avgReputation,
        rawAvgTrust: avgTrust,
      };
    }

    return {
      processedResult: privateCohorts,
      noiseAdded: totalNoiseAdded,
      isReliable,
      recordCount: cohorts.length,
    };
  }

  /**
   * Funnel analysis with differential privacy
   */
  private async executeFunnelAnalysis(query: AnalyticsQueryDto): Promise<any> {
    // Define funnel steps (example for user onboarding)
    const funnelSteps = [
      { name: 'registered', query: () => this.getRegisteredUsers() },
      { name: 'first_project', query: () => this.getFirstProjectCreators() },
      { name: 'first_contribution', query: () => this.getFirstContributors() },
      { name: 'repeated_activity', query: () => this.getRepeatedActivityUsers() },
    ];

    const epsilonPerStep = query.epsilon / funnelSteps.length;
    const funnelResults = [];
    let totalNoiseAdded = 0;
    let isReliable = true;

    for (const step of funnelSteps) {
      const stepData = await step.query();
      const privateResult = this.differentialPrivacyService.privateCount(stepData.length, epsilonPerStep);
      
      totalNoiseAdded += Math.abs(privateResult.noiseAdded);
      isReliable = isReliable && privateResult.isReliable;

      funnelResults.push({
        step: step.name,
        count: privateResult.value,
        rawCount: stepData.length,
        conversionRate: 0, // Will be calculated below
      });
    }

    // Calculate conversion rates
    for (let i = 1; i < funnelResults.length; i++) {
      const previous = funnelResults[i - 1].count;
      const current = funnelResults[i].count;
      funnelResults[i].conversionRate = previous > 0 ? (current / previous) * 100 : 0;
    }

    return {
      processedResult: { funnel: funnelResults },
      noiseAdded: totalNoiseAdded,
      isReliable,
      recordCount: funnelResults[0]?.rawCount || 0,
    };
  }

  /**
   * Retention analysis with differential privacy
   */
  private async executeRetentionAnalysis(query: AnalyticsQueryDto): Promise<any> {
    const startDate = query.startDate ? moment(query.startDate).toDate() : moment().subtract(90, 'days').toDate();
    const endDate = query.endDate ? moment(query.endDate).toDate() : new Date();

    // Get users who registered in the period
    const cohortUsers = await this.prisma.user.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    // Calculate retention for different periods (1 day, 7 days, 30 days)
    const retentionPeriods = [1, 7, 30];
    const epsilonPerPeriod = query.epsilon / retentionPeriods.length;
    
    const retentionResults = [];
    let totalNoiseAdded = 0;
    let isReliable = true;

    for (const period of retentionPeriods) {
      let retainedCount = 0;

      for (const user of cohortUsers) {
        const checkDate = moment(user.createdAt).add(period, 'days').toDate();
        const activityCheck = await this.checkUserActivity(user.id, user.createdAt, checkDate);
        if (activityCheck) retainedCount++;
      }

      const privateResult = this.differentialPrivacyService.privateCount(retainedCount, epsilonPerPeriod);
      const retentionRate = cohortUsers.length > 0 ? (retainedCount / cohortUsers.length) * 100 : 0;
      const privateRetentionRate = cohortUsers.length > 0 ? (privateResult.value / cohortUsers.length) * 100 : 0;

      totalNoiseAdded += Math.abs(privateResult.noiseAdded);
      isReliable = isReliable && privateResult.isReliable;

      retentionResults.push({
        period: `${period} days`,
        retained: privateResult.value,
        retentionRate: privateRetentionRate,
        rawRetained: retainedCount,
        rawRetentionRate: retentionRate,
      });
    }

    return {
      processedResult: { retention: retentionResults },
      noiseAdded: totalNoiseAdded,
      isReliable,
      recordCount: cohortUsers.length,
    };
  }

  /**
   * Simple aggregate count with differential privacy
   */
  private async executeAggregateCount(query: AnalyticsQueryDto): Promise<any> {
    const baseQuery = this.buildBaseQuery(query);
    const count = await this.prisma.user.count(baseQuery);
    
    const privateResult = this.differentialPrivacyService.privateCount(count, query.epsilon);

    return {
      processedResult: { count: privateResult.value },
      noiseAdded: privateResult.noiseAdded,
      isReliable: privateResult.isReliable,
      confidenceInterval: privateResult.confidenceInterval,
      rawCount: count,
    };
  }

  /**
   * Aggregate sum with differential privacy
   */
  private async executeAggregateSum(query: AnalyticsQueryDto): Promise<any> {
    const baseQuery = this.buildBaseQuery(query);
    
    // Get sum of reputation scores as example
    const users = await this.prisma.user.findMany({
      ...baseQuery,
      select: { reputationScore: true },
    });

    const sum = users.reduce((total, user) => total + user.reputationScore, 0);
    const bounds: [number, number] = [0, 1000]; // Reasonable bounds for reputation scores
    
    const privateResult = this.differentialPrivacyService.privateSum(sum, query.epsilon, bounds);

    return {
      processedResult: { sum: privateResult.value },
      noiseAdded: privateResult.noiseAdded,
      isReliable: privateResult.isReliable,
      confidenceInterval: privateResult.confidenceInterval,
      rawCount: users.length,
    };
  }

  /**
   * Aggregate average with differential privacy
   */
  private async executeAggregateAverage(query: AnalyticsQueryDto): Promise<any> {
    const baseQuery = this.buildBaseQuery(query);
    
    // Get average of reputation scores as example
    const users = await this.prisma.user.findMany({
      ...baseQuery,
      select: { reputationScore: true },
    });

    const sum = users.reduce((total, user) => total + user.reputationScore, 0);
    const average = users.length > 0 ? sum / users.length : 0;
    const bounds: [number, number] = [0, 1000];
    
    const privateResult = this.differentialPrivacyService.privateAverage(
      average,
      users.length,
      query.epsilon,
      bounds
    );

    return {
      processedResult: { average: privateResult.value },
      noiseAdded: privateResult.noiseAdded,
      isReliable: privateResult.isReliable,
      confidenceInterval: privateResult.confidenceInterval,
      rawCount: users.length,
    };
  }

  /**
   * Get user's privacy budget information
   */
  async getUserBudget(userId: string): Promise<any> {
    return await this.privacyBudgetService.getUserBudget(userId);
  }

  /**
   * Get privacy budget statistics (admin only)
   */
  async getBudgetStatistics(): Promise<any> {
    return await this.privacyBudgetService.getBudgetStatistics();
  }

  // Helper methods

  private groupByWeek(items: any[], dateField: string): { [key: string]: any[] } {
    const groups = {};
    
    items.forEach(item => {
      const week = moment(item[dateField]).startOf('week').format('YYYY-MM-DD');
      if (!groups[week]) groups[week] = [];
      groups[week].push(item);
    });

    return groups;
  }

  private buildBaseQuery(query: AnalyticsQueryDto): any {
    const where: any = {};

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = moment(query.startDate).toDate();
      if (query.endDate) where.createdAt.lte = moment(query.endDate).toDate();
    }

    if (query.filterField && query.filterValue) {
      where[query.filterField] = query.filterValue;
    }

    return { where };
  }

  private async getRegisteredUsers(): Promise<any[]> {
    return await this.prisma.user.findMany({
      select: { id: true },
    });
  }

  private async getFirstProjectCreators(): Promise<any[]> {
    const creators = await this.prisma.project.groupBy({
      by: ['creatorId'],
      _min: { createdAt: true },
    });

    return creators.map(creator => ({ id: creator.creatorId }));
  }

  private async getFirstContributors(): Promise<any[]> {
    const contributors = await this.prisma.contribution.groupBy({
      by: ['investorId'],
      _min: { createdAt: true },
    });

    return contributors.map(contributor => ({ id: contributor.investorId }));
  }

  private async getRepeatedActivityUsers(): Promise<any[]> {
    // Users with more than 3 contributions or projects
    const [projectCount, contributionCount] = await Promise.all([
      this.prisma.project.groupBy({
        by: ['creatorId'],
        _count: { id: true },
        having: { id: { _count: { gt: 3 } } },
      }),
      this.prisma.contribution.groupBy({
        by: ['investorId'],
        _count: { id: true },
        having: { id: { _count: { gt: 3 } } },
      }),
    ]);

    const activeUsers = new Set();
    projectCount.forEach(p => activeUsers.add(p.creatorId));
    contributionCount.forEach(c => activeUsers.add(c.investorId));

    return Array.from(activeUsers).map(id => ({ id }));
  }

  private async checkUserActivity(userId: string, startDate: Date, endDate: Date): Promise<boolean> {
    const [projects, contributions] = await Promise.all([
      this.prisma.project.count({
        where: {
          creatorId: userId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.contribution.count({
        where: {
          investorId: userId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    return projects > 0 || contributions > 0;
  }

  /**
   * Get cache key for query results
   */
  private getCacheKey(query: AnalyticsQueryDto): string {
    return `${query.queryType}_${JSON.stringify(query)}_${query.epsilon}`;
  }

  /**
   * Check if cached result exists and is valid
   */
  private async getCachedResult(cacheKey: string): Promise<any> {
    const cached = await this.prisma.analyticsCache.findUnique({
      where: { cacheKey },
    });

    if (cached && cached.expiresAt > new Date()) {
      return cached.result;
    }

    return null;
  }

  /**
   * Cache query result
   */
  private async cacheResult(cacheKey: string, query: AnalyticsQueryDto, result: any): Promise<void> {
    const expiresAt = moment().add(1, 'hour').toDate();

    await this.prisma.analyticsCache.create({
      data: {
        cacheKey,
        queryType: query.queryType,
        parameters: query as any, // Convert to JSON-compatible format
        result,
        epsilon: query.epsilon,
        expiresAt,
      },
    });
  }
}
