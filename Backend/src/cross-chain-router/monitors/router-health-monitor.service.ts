import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ChainAdapterService } from './chain-adapter.service';

/**
 * RouterHealthMonitor continuously monitors router health and metrics
 */
@Injectable()
export class RouterHealthMonitor {
  private readonly logger = new Logger(RouterHealthMonitor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainAdapter: ChainAdapterService,
  ) {}

  /**
   * Monitor health every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async monitorHealth(): Promise<void> {
    try {
      // Monitor chain health
      await this.chainAdapter.monitorChainHealth();

      // Update router status
      await this.updateRouterStatus();

      // Check failed messages
      await this.checkFailedMessages();
    } catch (error) {
      this.logger.error(`Health monitoring failed: ${error.message}`);
    }
  }

  /**
   * Update router status for each chain
   */
  private async updateRouterStatus(): Promise<void> {
    try {
      const adapters = await this.prisma.chainAdapter.findMany({
        where: { isActive: true },
      });

      for (const adapter of adapters) {
        // Calculate metrics
        const avgLatency = await this.calculateAverageLatency(adapter.blockchain);
        const metrics = await this.calculateThroughputMetrics(adapter.blockchain);

        await this.prisma.routerStatus.upsert({
          where: { chainId: adapter.chainId },
          create: {
            chainId: adapter.chainId,
            isHealthy: adapter.isHealthy,
            avgLatency,
            messageProcessingSpeed: metrics.speed,
            errorCount: metrics.errorCount,
            successCount: metrics.successCount,
          },
          update: {
            isHealthy: adapter.isHealthy,
            avgLatency,
            messageProcessingSpeed: metrics.speed,
            lastHealthCheck: new Date(),
            errorCount: metrics.errorCount,
            successCount: metrics.successCount,
          },
        });
      }

      this.logger.debug('Router status updated');
    } catch (error) {
      this.logger.error(`Failed to update router status: ${error.message}`);
    }
  }

  /**
   * Calculate average message latency for a chain
   */
  private async calculateAverageLatency(blockchain: string): Promise<number> {
    try {
      const messages = await this.prisma.crossChainMessage.findMany({
        where: {
          sourceChain: blockchain,
          finalizedAt: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      if (messages.length === 0) {
        return 0;
      }

      const totalLatency = messages.reduce((sum, msg) => {
        const latency = msg.finalizedAt.getTime() - msg.initiatedAt.getTime();
        return sum + latency;
      }, 0);

      return Math.round(totalLatency / messages.length);
    } catch (error) {
      this.logger.error(`Failed to calculate latency: ${error.message}`);
      return 0;
    }
  }

  /**
   * Calculate throughput metrics for a chain
   */
  private async calculateThroughputMetrics(blockchain: string): Promise<any> {
    try {
      const oneHourAgo = new Date(Date.now() - 3600000);

      const [totalMessages, successMessages, errorMessages] = await Promise.all([
        this.prisma.crossChainMessage.count({
          where: {
            sourceChain: blockchain,
            createdAt: { gte: oneHourAgo },
          },
        }),
        this.prisma.crossChainMessage.count({
          where: {
            sourceChain: blockchain,
            status: 'RELEASED',
            createdAt: { gte: oneHourAgo },
          },
        }),
        this.prisma.crossChainMessage.count({
          where: {
            sourceChain: blockchain,
            status: 'FAILED',
            createdAt: { gte: oneHourAgo },
          },
        }),
      ]);

      const speed =
        totalMessages > 0 ? (successMessages / totalMessages) * 100 : 100;

      return {
        speed: Number(speed.toFixed(2)),
        errorCount: errorMessages,
        successCount: successMessages,
      };
    } catch (error) {
      this.logger.error(`Failed to calculate throughput: ${error.message}`);
      return { speed: 0, errorCount: 0, successCount: 0 };
    }
  }

  /**
   * Check for failed messages and attempt recovery
   */
  private async checkFailedMessages(): Promise<void> {
    try {
      const failedMessages = await this.prisma.crossChainMessage.findMany({
        where: {
          status: 'FAILED',
          createdAt: { gte: new Date(Date.now() - 86400000) }, // Last 24 hours
        },
        take: 10,
      });

      for (const message of failedMessages) {
        this.logger.warn(
          `Failed message detected: ${message.messageId} - ${message.errorMessage}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to check failed messages: ${error.message}`);
    }
  }

  /**
   * Get current router health status
   */
  async getHealth(): Promise<any> {
    try {
      const statuses = await this.prisma.routerStatus.findMany();
      const routes = await this.prisma.crossChainRoute.count({ where: { isActive: true } });

      const totalMessages = await this.prisma.crossChainMessage.count();
      const failedMessages = await this.prisma.crossChainMessage.count({
        where: { status: 'FAILED' },
      });

      const avgSpeed =
        statuses.length > 0
          ? (
              statuses.reduce((sum, s) => sum + Number(s.messageProcessingSpeed), 0) /
              statuses.length
            ).toFixed(2)
          : '0';

      return {
        overall: {
          healthy: statuses.every((s) => s.isHealthy),
          totalChains: statuses.length,
          totalRoutes: routes,
          averageProcessingSpeed: avgSpeed,
        },
        messaging: {
          total: totalMessages,
          failed: failedMessages,
          failureRate: totalMessages > 0 ? ((failedMessages / totalMessages) * 100).toFixed(2) : '0',
        },
        chains: statuses.map((s) => ({
          chainId: s.chainId,
          isHealthy: s.isHealthy,
          avgLatency: s.avgLatency,
          messageProcessingSpeed: s.messageProcessingSpeed,
          successCount: s.successCount,
          errorCount: s.errorCount,
          lastHealthCheck: s.lastHealthCheck,
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to get health status: ${error.message}`);
      return { error: error.message };
    }
  }
}
