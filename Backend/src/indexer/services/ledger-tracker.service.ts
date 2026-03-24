import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { TenantManagementService } from '../../tenancy/tenant-management.service';
import { LedgerCursor, LedgerInfo, ReorgDetectionResult } from '../types/ledger.types';

@Injectable()
export class LedgerTrackerService {
  private readonly logger = new Logger(LedgerTrackerService.name);
  private readonly network: string;
  private readonly reorgDepthThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tenantManagementService: TenantManagementService,
  ) {
    this.network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
    this.reorgDepthThreshold = this.configService.get<number>('INDEXER_REORG_DEPTH_THRESHOLD', 5);
  }

  async getLastCursor(): Promise<LedgerCursor | null> {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    const cursor = await this.prisma.ledgerCursor.findUnique({
      where: {
        tenantId_network: {
          tenantId: tenant.id,
          network: this.network,
        },
      },
    });

    if (!cursor) {
      return null;
    }

    return {
      id: cursor.id,
      network: cursor.network,
      lastLedgerSeq: cursor.lastLedgerSeq,
      lastLedgerHash: cursor.lastLedgerHash || undefined,
      updatedAt: cursor.updatedAt,
      createdAt: cursor.createdAt,
    };
  }

  async initializeCursor(startLedger: number): Promise<LedgerCursor> {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    this.logger.log(
      `Initializing ledger cursor at ledger ${startLedger} for network ${this.network}`,
    );

    const cursor = await this.prisma.ledgerCursor.upsert({
      where: {
        tenantId_network: {
          tenantId: tenant.id,
          network: this.network,
        },
      },
      update: {
        lastLedgerSeq: startLedger,
        lastLedgerHash: null,
      },
      create: {
        tenantId: tenant.id,
        network: this.network,
        lastLedgerSeq: startLedger,
        lastLedgerHash: null,
      },
    });

    return {
      id: cursor.id,
      network: cursor.network,
      lastLedgerSeq: cursor.lastLedgerSeq,
      lastLedgerHash: cursor.lastLedgerHash || undefined,
      updatedAt: cursor.updatedAt,
      createdAt: cursor.createdAt,
    };
  }

  async updateCursor(ledgerSeq: number, ledgerHash?: string): Promise<void> {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    await this.prisma.ledgerCursor.update({
      where: {
        tenantId_network: {
          tenantId: tenant.id,
          network: this.network,
        },
      },
      data: {
        lastLedgerSeq: ledgerSeq,
        lastLedgerHash: ledgerHash || null,
      },
    });

    this.logger.debug(`Updated cursor to ledger ${ledgerSeq}`);
  }

  async detectReorg(currentLedger: LedgerInfo): Promise<ReorgDetectionResult> {
    const cursor = await this.getLastCursor();

    if (!cursor || !cursor.lastLedgerHash) {
      return {
        hasReorg: false,
        reorgDepth: 0,
        lastValidLedger: currentLedger.sequence - 1,
        newLatestLedger: currentLedger.sequence,
      };
    }

    if (currentLedger.sequence === cursor.lastLedgerSeq) {
      const hasReorg = currentLedger.hash !== cursor.lastLedgerHash;

      if (hasReorg) {
        this.logger.warn(
          `Re-org detected at ledger ${currentLedger.sequence}. ` +
            `Expected hash: ${cursor.lastLedgerHash}, Got: ${currentLedger.hash}`,
        );
      }

      return {
        hasReorg,
        reorgDepth: hasReorg ? 1 : 0,
        lastValidLedger: hasReorg ? currentLedger.sequence - 1 : currentLedger.sequence,
        newLatestLedger: currentLedger.sequence,
      };
    }

    if (currentLedger.sequence > cursor.lastLedgerSeq) {
      return {
        hasReorg: false,
        reorgDepth: 0,
        lastValidLedger: cursor.lastLedgerSeq,
        newLatestLedger: currentLedger.sequence,
      };
    }

    this.logger.warn(
      `Re-org detected. Current ledger ${currentLedger.sequence} is behind cursor ${cursor.lastLedgerSeq}`,
    );

    return {
      hasReorg: true,
      reorgDepth: cursor.lastLedgerSeq - currentLedger.sequence,
      lastValidLedger: currentLedger.sequence,
      newLatestLedger: currentLedger.sequence,
    };
  }

  async handleReorg(reorgResult: ReorgDetectionResult): Promise<number> {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    if (!reorgResult.hasReorg) {
      return reorgResult.newLatestLedger;
    }

    this.logger.warn(
      `Handling re-org with depth ${reorgResult.reorgDepth}. ` +
        `Rolling back to ledger ${reorgResult.lastValidLedger}`,
    );

    const rollbackDepth = Math.min(reorgResult.reorgDepth + 2, this.reorgDepthThreshold);
    const safeLedgerSeq = Math.max(0, reorgResult.lastValidLedger - rollbackDepth);

    await this.prisma.processedEvent.deleteMany({
      where: {
        tenantId: tenant.id,
        network: this.network,
        ledgerSeq: {
          gt: safeLedgerSeq,
        },
      },
    });

    this.logger.log(`Deleted processed events after ledger ${safeLedgerSeq}`);
    await this.updateCursor(safeLedgerSeq);
    this.logger.log(`Re-org handled. Resuming from ledger ${safeLedgerSeq}`);

    return safeLedgerSeq;
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    const count = await this.prisma.processedEvent.count({
      where: {
        tenantId: tenant.id,
        eventId,
        network: this.network,
      },
    });

    return count > 0;
  }

  async markEventProcessed(
    eventId: string,
    ledgerSeq: number,
    contractId: string,
    eventType: string,
    transactionHash: string,
  ): Promise<void> {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    await this.prisma.processedEvent.upsert({
      where: {
        tenantId_eventId: {
          tenantId: tenant.id,
          eventId,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        eventId,
        network: this.network,
        ledgerSeq,
        contractId,
        eventType,
        transactionHash,
      },
    });
  }

  async getStartLedger(latestLedger: number): Promise<number> {
    const cursor = await this.getLastCursor();
    const configuredStart = this.configService.get<number>('INDEXER_START_LEDGER');

    if (cursor) {
      return cursor.lastLedgerSeq + 1;
    }

    if (configuredStart) {
      this.logger.log(`Using configured start ledger: ${configuredStart}`);
      await this.initializeCursor(configuredStart - 1);
      return configuredStart;
    }

    this.logger.log(`Starting from current ledger: ${latestLedger}`);
    await this.initializeCursor(latestLedger - 1);
    return latestLedger;
  }

  async logProgress(
    currentLedger: number,
    targetLedger: number,
    eventsProcessed: number,
  ): Promise<void> {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    const remaining = targetLedger - currentLedger;
    const progress = ((currentLedger / targetLedger) * 100).toFixed(2);

    this.logger.log(
      `Progress: Ledger ${currentLedger}/${targetLedger} (${progress}%) | ` +
        `Events: ${eventsProcessed} | Remaining: ${remaining}`,
    );

    await this.prisma.indexerLog.create({
      data: {
        tenantId: tenant.id,
        level: 'info',
        message: `Processed ledger ${currentLedger}`,
        metadata: {
          currentLedger,
          targetLedger,
          eventsProcessed,
          progress: parseFloat(progress),
          network: this.network,
        },
      },
    });
  }

  async logError(message: string, metadata?: Record<string, unknown>): Promise<void> {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    this.logger.error(message, metadata);

    await this.prisma.indexerLog.create({
      data: {
        tenantId: tenant.id,
        level: 'error',
        message,
        metadata: (metadata || {}) as never,
      },
    });
  }
}
