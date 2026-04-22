import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrivacyBudgetService } from './privacy-budget.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly privacyBudgetService: PrivacyBudgetService,
  ) {}

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @Roles('analyst', 'admin')
  async executeQuery(@Request() req, @Body() query: AnalyticsQueryDto) {
    try {
      const userId = req.user.sub; // Extract user ID from JWT token
      const result = await this.analyticsService.executeQuery(userId, query);
      return {
        success: true,
        data: result,
        message: 'Query executed successfully with differential privacy protection',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Query execution failed: ${error.message}`);
    }
  }

  @Get('budget')
  @Roles('analyst', 'admin')
  async getUserBudget(@Request() req) {
    try {
      const userId = req.user.sub;
      const budget = await this.analyticsService.getUserBudget(userId);
      return {
        success: true,
        data: budget,
        message: 'Privacy budget retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve budget: ${error.message}`);
    }
  }

  @Get('budget/statistics')
  @Roles('admin')
  async getBudgetStatistics() {
    try {
      const statistics = await this.analyticsService.getBudgetStatistics();
      return {
        success: true,
        data: statistics,
        message: 'Budget statistics retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve statistics: ${error.message}`);
    }
  }

  @Get('budget/export')
  @Roles('admin')
  async exportBudgetData() {
    try {
      const exportData = await this.privacyBudgetService.exportBudgetData();
      return {
        success: true,
        data: exportData,
        message: 'Budget data exported successfully for compliance reporting',
      };
    } catch (error) {
      throw new BadRequestException(`Failed to export data: ${error.message}`);
    }
  }

  @Post('budget/reset/:userId')
  @Roles('admin')
  async resetUserBudget(@Param('userId') userId: string) {
    try {
      await this.privacyBudgetService.resetUserBudgetManually(userId);
      return {
        success: true,
        message: `Budget reset successfully for user ${userId}`,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to reset budget: ${error.message}`);
    }
  }

  @Post('budget/adjust/:userId')
  @Roles('admin')
  async adjustUserBudget(
    @Param('userId') userId: string,
    @Body() body: { totalBudget: number },
  ) {
    try {
      const { totalBudget } = body;
      if (!totalBudget || totalBudget <= 0 || totalBudget > 2.0) {
        throw new BadRequestException('Total budget must be between 0 and 2.0');
      }

      await this.privacyBudgetService.adjustUserBudget(userId, totalBudget);
      return {
        success: true,
        message: `Budget adjusted successfully for user ${userId} to ${totalBudget}`,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to adjust budget: ${error.message}`);
    }
  }

  @Get('query-history/:userId')
  @Roles('admin')
  async getQueryHistory(@Param('userId') userId: string) {
    try {
      const history = await this.privacyBudgetService.getQueryHistory(userId, 50);
      return {
        success: true,
        data: history,
        message: 'Query history retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve query history: ${error.message}`);
    }
  }

  @Get('health')
  @Roles('admin')
  async getHealthStatus() {
    try {
      const statistics = await this.analyticsService.getBudgetStatistics();
      const isHealthy = statistics.usersNearLimit < statistics.totalUsers * 0.1; // Less than 10% near limit

      return {
        success: true,
        data: {
          status: isHealthy ? 'healthy' : 'warning',
          totalUsers: statistics.totalUsers,
          usersNearLimit: statistics.usersNearLimit,
          averageUsage: statistics.averageUsage,
          message: isHealthy 
            ? 'Privacy analytics system is operating normally' 
            : 'Warning: Many users are approaching their privacy budget limits',
        },
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get health status: ${error.message}`);
    }
  }

  @Get('query-types')
  @Roles('analyst', 'admin')
  async getSupportedQueryTypes() {
    return {
      success: true,
      data: {
        queryTypes: [
          {
            type: 'cohort_analysis',
            description: 'Analyze user cohorts based on registration time and behavior',
            epsilonRange: [0.1, 1.0],
            typicalEpsilon: 0.5,
          },
          {
            type: 'funnel_analysis',
            description: 'Track user conversion through defined funnel steps',
            epsilonRange: [0.1, 1.0],
            typicalEpsilon: 0.4,
          },
          {
            type: 'retention_analysis',
            description: 'Measure user retention over different time periods',
            epsilonRange: [0.1, 1.0],
            typicalEpsilon: 0.6,
          },
          {
            type: 'aggregate_count',
            description: 'Get differential private count of records',
            epsilonRange: [0.1, 1.0],
            typicalEpsilon: 0.3,
          },
          {
            type: 'aggregate_sum',
            description: 'Get differential private sum of numeric fields',
            epsilonRange: [0.1, 1.0],
            typicalEpsilon: 0.3,
          },
          {
            type: 'aggregate_average',
            description: 'Get differential private average of numeric fields',
            epsilonRange: [0.1, 1.0],
            typicalEpsilon: 0.4,
          },
        ],
        timeGranularity: ['hourly', 'daily', 'weekly', 'monthly'],
        epsilonGuidelines: {
          '0.1-0.2': 'High privacy, lower accuracy',
          '0.3-0.5': 'Balanced privacy and accuracy',
          '0.6-1.0': 'Lower privacy, higher accuracy',
        },
      },
      message: 'Supported query types and guidelines retrieved successfully',
    };
  }
}
