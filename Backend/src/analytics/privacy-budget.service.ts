import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PrivacyBudgetDto, PrivacyBudgetResponseDto, BudgetOperation } from './dto/privacy-budget.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PrivacyBudgetService {
  private readonly logger = new Logger(PrivacyBudgetService.name);
  private readonly DEFAULT_BUDGET = 1.0; // Default annual privacy budget
  private readonly RESET_INTERVAL_DAYS = 365; // Annual reset

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get user's current privacy budget status
   */
  async getUserBudget(userId: string): Promise<PrivacyBudgetResponseDto> {
    let budget = await this.prisma.privacyBudget.findUnique({
      where: { userId },
      include: { queries: true },
    });

    if (!budget) {
      budget = await this.createUserBudget(userId);
    }

    // Check if budget needs reset
    const needsReset = this.shouldResetBudget(budget.lastReset);
    if (needsReset) {
      budget = await this.resetUserBudget(userId);
    }

    return {
      userId: budget.userId,
      totalBudget: budget.totalBudget,
      usedBudget: budget.usedBudget,
      remainingBudget: budget.totalBudget - budget.usedBudget,
      lastReset: budget.lastReset,
      queries: budget.queries.map(query => ({
        queryId: query.queryId,
        epsilon: query.epsilon,
        timestamp: query.timestamp,
        description: query.description || 'No description',
        status: query.status as 'completed' | 'reserved' | 'failed',
      })),
    };
  }

  /**
   * Reserve privacy budget for a query
   */
  async reserveBudget(userId: string, epsilon: number, description?: string): Promise<string> {
    if (epsilon <= 0 || epsilon > 1.0) {
      throw new BadRequestException('Epsilon must be between 0 and 1.0');
    }

    const budget = await this.getUserBudget(userId);
    
    if (budget.remainingBudget < epsilon) {
      throw new BadRequestException(
        `Insufficient privacy budget. Required: ${epsilon}, Available: ${budget.remainingBudget}`
      );
    }

    const queryId = uuidv4();

    await this.prisma.privacyBudget.update({
      where: { userId },
      data: {
        usedBudget: { increment: epsilon },
        queries: {
          create: {
            queryId,
            epsilon,
            description,
            status: 'RESERVED',
          },
        },
      },
    });

    this.logger.log(`Reserved ${epsilon} epsilon for user ${userId}, query ${queryId}`);
    return queryId;
  }

  /**
   * Confirm budget consumption after successful query
   */
  async confirmBudgetUsage(queryId: string): Promise<void> {
    const query = await this.prisma.privacyBudgetQuery.findUnique({
      where: { queryId },
    });

    if (!query) {
      throw new NotFoundException(`Query ${queryId} not found`);
    }

    if (query.status !== 'RESERVED') {
      throw new BadRequestException(`Query ${queryId} is not in reserved state`);
    }

    await this.prisma.privacyBudgetQuery.update({
      where: { queryId },
      data: { status: 'COMPLETED' },
    });

    this.logger.log(`Confirmed budget usage for query ${queryId}`);
  }

  /**
   * Release reserved budget (for failed queries)
   */
  async releaseBudget(queryId: string): Promise<void> {
    const query = await this.prisma.privacyBudgetQuery.findUnique({
      where: { queryId },
      include: { budget: true },
    });

    if (!query) {
      throw new NotFoundException(`Query ${queryId} not found`);
    }

    if (query.status !== 'RESERVED') {
      throw new BadRequestException(`Query ${queryId} is not in reserved state`);
    }

    await this.prisma.$transaction([
      this.prisma.privacyBudget.update({
        where: { userId: query.budget.userId },
        data: { usedBudget: { decrement: query.epsilon } },
      }),
      this.prisma.privacyBudgetQuery.update({
        where: { queryId },
        data: { status: 'FAILED' },
      }),
    ]);

    this.logger.log(`Released ${query.epsilon} epsilon for query ${queryId}`);
  }

  /**
   * Check if user has sufficient budget for a query
   */
  async hasSufficientBudget(userId: string, epsilon: number): Promise<boolean> {
    const budget = await this.getUserBudget(userId);
    return budget.remainingBudget >= epsilon;
  }

  /**
   * Get privacy budget statistics for admin monitoring
   */
  async getBudgetStatistics(): Promise<{
    totalUsers: number;
    averageUsage: number;
    totalConsumed: number;
    usersNearLimit: number;
    budgetDistribution: { low: number; medium: number; high: number; critical: number };
  }> {
    const budgets = await this.prisma.privacyBudget.findMany({
      include: { queries: true },
    });

    const totalUsers = budgets.length;
    const totalConsumed = budgets.reduce((sum, budget) => sum + budget.usedBudget, 0);
    const averageUsage = totalUsers > 0 ? totalConsumed / totalUsers : 0;

    const usersNearLimit = budgets.filter(budget => {
      const remaining = budget.totalBudget - budget.usedBudget;
      return remaining < 0.1; // Less than 10% remaining
    }).length;

    const budgetDistribution = budgets.reduce(
      (acc, budget) => {
        const usageRatio = budget.usedBudget / budget.totalBudget;
        if (usageRatio < 0.25) acc.low++;
        else if (usageRatio < 0.5) acc.medium++;
        else if (usageRatio < 0.9) acc.high++;
        else acc.critical++;
        return acc;
      },
      { low: 0, medium: 0, high: 0, critical: 0 }
    );

    return {
      totalUsers,
      averageUsage,
      totalConsumed,
      usersNearLimit,
      budgetDistribution,
    };
  }

  /**
   * Manually reset user's privacy budget (admin function)
   */
  async resetUserBudgetManually(userId: string): Promise<void> {
    await this.prisma.privacyBudget.update({
      where: { userId },
      data: {
        usedBudget: 0,
        lastReset: new Date(),
      },
    });

    this.logger.warn(`Manual budget reset for user ${userId}`);
  }

  /**
   * Adjust user's total budget (admin function)
   */
  async adjustUserBudget(userId: string, newTotalBudget: number): Promise<void> {
    if (newTotalBudget <= 0 || newTotalBudget > 2.0) {
      throw new BadRequestException('Total budget must be between 0 and 2.0');
    }

    const budget = await this.prisma.privacyBudget.findUnique({
      where: { userId },
    });

    if (!budget) {
      await this.createUserBudget(userId, newTotalBudget);
    } else {
      // Ensure used budget doesn't exceed new total
      const updatedUsedBudget = Math.min(budget.usedBudget, newTotalBudget);
      
      await this.prisma.privacyBudget.update({
        where: { userId },
        data: {
          totalBudget: newTotalBudget,
          usedBudget: updatedUsedBudget,
        },
      });
    }

    this.logger.log(`Adjusted budget for user ${userId} to ${newTotalBudget}`);
  }

  /**
   * Get query history for a user
   */
  async getQueryHistory(userId: string, limit: number = 50): Promise<any[]> {
    const budget = await this.prisma.privacyBudget.findUnique({
      where: { userId },
      include: {
        queries: {
          orderBy: { timestamp: 'desc' },
          take: limit,
        },
      },
    });

    if (!budget) {
      return [];
    }

    return budget.queries.map(query => ({
      queryId: query.queryId,
      epsilon: query.epsilon,
      timestamp: query.timestamp,
      description: query.description,
      status: query.status,
    }));
  }

  private async createUserBudget(userId: string, totalBudget: number = this.DEFAULT_BUDGET): Promise<any> {
    return await this.prisma.privacyBudget.create({
      data: {
        userId,
        totalBudget,
        usedBudget: 0,
        lastReset: new Date(),
      },
      include: { queries: true },
    });
  }

  private async resetUserBudget(userId: string): Promise<any> {
    await this.prisma.privacyBudget.update({
      where: { userId },
      data: {
        usedBudget: 0,
        lastReset: new Date(),
      },
    });

    return await this.prisma.privacyBudget.findUnique({
      where: { userId },
      include: { queries: true },
    });
  }

  private shouldResetBudget(lastReset: Date): boolean {
    const now = new Date();
    const daysSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceReset >= this.RESET_INTERVAL_DAYS;
  }

  /**
   * Cleanup old query records
   */
  async cleanupOldQueries(daysToKeep: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deleted = await this.prisma.privacyBudgetQuery.deleteMany({
      where: {
        timestamp: { lt: cutoffDate },
        status: { in: ['COMPLETED', 'FAILED'] },
      },
    });

    this.logger.log(`Cleaned up ${deleted.count} old query records`);
  }

  /**
   * Export privacy budget data for compliance reporting
   */
  async exportBudgetData(): Promise<any[]> {
    const budgets = await this.prisma.privacyBudget.findMany({
      include: {
        queries: {
          select: {
            queryId: true,
            epsilon: true,
            timestamp: true,
            description: true,
            status: true,
          },
        },
      },
    });

    return budgets.map(budget => ({
      userId: budget.userId,
      totalBudget: budget.totalBudget,
      usedBudget: budget.usedBudget,
      remainingBudget: budget.totalBudget - budget.usedBudget,
      lastReset: budget.lastReset,
      createdAt: budget.createdAt,
      queryCount: budget.queries.length,
      recentQueries: budget.queries.slice(-10), // Last 10 queries
    }));
  }
}
