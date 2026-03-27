import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { 
  RegulatoryReportType,
  RegulatoryEntityType,
  RegulatoryAction 
} from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ReportRetentionService {
  private readonly logger = new Logger(ReportRetentionService.name);

  // Retention periods in days (7 years minimum for regulatory compliance)
  private readonly RETENTION_PERIODS: Record<RegulatoryReportType, number> = {
    [RegulatoryReportType.TRADE_REPORTING]: 365 * 7, // 7 years
    [RegulatoryReportType.SUSPICIOUS_ACTIVITY]: 365 * 10, // 10 years for SARs
    [RegulatoryReportType.COMPLIANCE_CERTIFICATION]: 365 * 7, // 7 years
    [RegulatoryReportType.QUARTERLY_FILING]: 365 * 7, // 7 years
    [RegulatoryReportType.ANNUAL_REPORT]: 365 * 10, // 10 years for annual reports
    [RegulatoryReportType.AD_HOC_REPORT]: 365 * 7, // 7 years
  };

  constructor(private readonly prisma: PrismaService) {}

  async createRetentionPolicy(reportId: string) {
    this.logger.log(`Creating retention policy for report ${reportId}`);

    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    // Check if retention policy already exists
    const existingRetention = await this.prisma.reportRetention.findUnique({
      where: { reportId },
    });

    if (existingRetention) {
      this.logger.log(`Retention policy already exists for report ${reportId}`);
      return existingRetention;
    }

    const retentionPeriod = this.RETENTION_PERIODS[report.reportType];
    const expiresAt = new Date(report.createdAt.getTime() + retentionPeriod * 24 * 60 * 60 * 1000);

    const retention = await this.prisma.reportRetention.create({
      data: {
        reportId,
        retentionPeriod,
        expiresAt,
      },
    });

    this.logger.log(`Retention policy created for report ${reportId}, expires: ${expiresAt}`);
    return retention;
  }

  async archiveExpiredReports() {
    this.logger.log('Starting archive process for expired reports');

    const expiredReports = await this.prisma.reportRetention.findMany({
      where: {
        expiresAt: { lte: new Date() },
        archived: false,
        deletionScheduled: false,
      },
      include: {
        report: true,
      },
    });

    this.logger.log(`Found ${expiredReports.length} expired reports to archive`);

    let archivedCount = 0;
    let failedCount = 0;

    for (const retention of expiredReports) {
      try {
        await this.archiveReport(retention.reportId);
        archivedCount++;
      } catch (error) {
        this.logger.error(`Failed to archive report ${retention.reportId}: ${error.message}`);
        failedCount++;
      }
    }

    this.logger.log(`Archive process completed: ${archivedCount} archived, ${failedCount} failed`);
    return { archivedCount, failedCount };
  }

  async scheduleReportDeletion(reportId: string, deletionDate?: Date) {
    this.logger.log(`Scheduling deletion for report ${reportId}`);

    const retention = await this.prisma.reportRetention.findUnique({
      where: { reportId },
    });

    if (!retention) {
      throw new Error(`Retention policy not found for report ${reportId}`);
    }

    if (!retention.archived) {
      throw new Error(`Report ${reportId} must be archived before deletion can be scheduled`);
    }

    const scheduledDeletionDate = deletionDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    await this.prisma.reportRetention.update({
      where: { reportId },
      data: {
        deletionScheduled: true,
        // Update expiresAt to the scheduled deletion date
        expiresAt: scheduledDeletionDate,
      },
    });

    // Log the scheduling
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.RETENTION_POLICY,
        entityId: retention.id,
        action: RegulatoryAction.UPDATE,
        performedBy: 'system',
        previousState: { deletionScheduled: false },
        newState: { deletionScheduled: true, scheduledDeletionDate },
        reason: 'Report deletion scheduled',
      },
    });

    this.logger.log(`Report ${reportId} deletion scheduled for ${scheduledDeletionDate}`);
  }

  async deleteScheduledReports() {
    this.logger.log('Starting deletion process for scheduled reports');

    const scheduledReports = await this.prisma.reportRetention.findMany({
      where: {
        deletionScheduled: true,
        expiresAt: { lte: new Date() },
        deletedAt: null,
      },
      include: {
        report: true,
      },
    });

    this.logger.log(`Found ${scheduledReports.length} reports scheduled for deletion`);

    let deletedCount = 0;
    let failedCount = 0;

    for (const retention of scheduledReports) {
      try {
        await this.deleteReport(retention.reportId);
        deletedCount++;
      } catch (error) {
        this.logger.error(`Failed to delete report ${retention.reportId}: ${error.message}`);
        failedCount++;
      }
    }

    this.logger.log(`Deletion process completed: ${deletedCount} deleted, ${failedCount} failed`);
    return { deletedCount, failedCount };
  }

  private async archiveReport(reportId: string) {
    this.logger.log(`Archiving report ${reportId}`);

    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
      include: {
        tradeRecords: true,
        sarRecords: true,
        complianceItems: true,
      },
    });

    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    // Compress and encrypt report data (mock implementation)
    const archiveData = await this.compressAndEncryptReport(report);

    // Store in archive location (mock - would use S3, Azure Blob, etc.)
    const archiveLocation = await this.storeInArchive(archiveData, reportId);

    // Update retention record
    await this.prisma.reportRetention.update({
      where: { reportId },
      data: {
        archived: true,
        archiveLocation,
      },
    });

    // Update report status to archived
    await this.prisma.regulatoryReport.update({
      where: { id: reportId },
      data: {
        // Note: We don't delete the actual report record, just mark as archived
        // In a real implementation, we might move data to cold storage
      },
    });

    // Log the archiving
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.REPORT,
        entityId: reportId,
        action: RegulatoryAction.ARCHIVE,
        performedBy: 'system',
        previousState: { archived: false },
        newState: { archived: true, archiveLocation },
        reason: 'Report archived due to retention policy',
      },
    });

    this.logger.log(`Report ${reportId} archived to ${archiveLocation}`);
  }

  private async deleteReport(reportId: string) {
    this.logger.log(`Deleting report ${reportId}`);

    const retention = await this.prisma.reportRetention.findUnique({
      where: { reportId },
    });

    if (!retention) {
      throw new Error(`Retention policy not found for report ${reportId}`);
    }

    // Delete from archive storage first
    if (retention.archiveLocation) {
      await this.deleteFromArchive(retention.archiveLocation);
    }

    // Delete related records (cascade delete should handle this, but being explicit)
    await this.prisma.tradeReportRecord.deleteMany({
      where: { reportId },
    });

    await this.prisma.suspiciousActivityReport.deleteMany({
      where: { reportId },
    });

    await this.prisma.complianceReportItem.deleteMany({
      where: { reportId },
    });

    // Delete the report
    await this.prisma.regulatoryReport.delete({
      where: { id: reportId },
    });

    // Update retention record
    await this.prisma.reportRetention.update({
      where: { reportId },
      data: { deletedAt: new Date() },
    });

    // Log the deletion
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.REPORT,
        entityId: reportId,
        action: RegulatoryAction.DELETE,
        performedBy: 'system',
        previousState: { deleted: false },
        newState: { deleted: true },
        reason: 'Report deleted per retention policy',
      },
    });

    this.logger.log(`Report ${reportId} permanently deleted`);
  }

  async restoreArchivedReport(reportId: string) {
    this.logger.log(`Restoring archived report ${reportId}`);

    const retention = await this.prisma.reportRetention.findUnique({
      where: { reportId },
      include: { report: true },
    });

    if (!retention) {
      throw new Error(`Retention policy not found for report ${reportId}`);
    }

    if (!retention.archived) {
      throw new Error(`Report ${reportId} is not archived`);
    }

    if (!retention.archiveLocation) {
      throw new Error(`Archive location not found for report ${reportId}`);
    }

    // Retrieve from archive
    const archiveData = await this.retrieveFromArchive(retention.archiveLocation);

    // Decrypt and decompress
    const reportData = await this.decryptAndDecompressReport(archiveData);

    // Restore report data (mock implementation)
    await this.restoreReportData(reportData);

    // Update retention record
    await this.prisma.reportRetention.update({
      where: { reportId },
      data: {
        archived: false,
        archiveLocation: null,
      },
    });

    // Log the restoration
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.REPORT,
        entityId: reportId,
        action: RegulatoryAction.RESTORE,
        performedBy: 'system',
        previousState: { archived: true },
        newState: { archived: false },
        reason: 'Report restored from archive',
      },
    });

    this.logger.log(`Report ${reportId} restored from archive`);
  }

  async getRetentionStatistics() {
    const [
      totalReports,
      activeReports,
      archivedReports,
      deletionScheduled,
      deletedReports,
    ] = await Promise.all([
      this.prisma.reportRetention.count(),
      this.prisma.reportRetention.count({ where: { archived: false, deletedAt: null } }),
      this.prisma.reportRetention.count({ where: { archived: true, deletedAt: null } }),
      this.prisma.reportRetention.count({ where: { deletionScheduled: true, deletedAt: null } }),
      this.prisma.reportRetention.count({ where: { deletedAt: { not: null } } }),
    ]);

    // Get reports expiring in next 30 days
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoon = await this.prisma.reportRetention.count({
      where: {
        expiresAt: { lte: thirtyDaysFromNow },
        archived: false,
        deletedAt: null,
      },
    });

    return {
      total: totalReports,
      active: activeReports,
      archived: archivedReports,
      deletionScheduled,
      deleted: deletedReports,
      expiringSoon,
    };
  }

  async getRetentionPolicies(reportType?: RegulatoryReportType) {
    const where = reportType ? { report: { reportType } } : {};

    return this.prisma.reportRetention.findMany({
      where,
      include: {
        report: true,
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async extendRetentionPeriod(reportId: string, additionalDays: number, reason: string) {
    this.logger.log(`Extending retention period for report ${reportId} by ${additionalDays} days`);

    const retention = await this.prisma.reportRetention.findUnique({
      where: { reportId },
    });

    if (!retention) {
      throw new Error(`Retention policy not found for report ${reportId}`);
    }

    const newExpiresAt = new Date(retention.expiresAt.getTime() + additionalDays * 24 * 60 * 60 * 1000);

    const updatedRetention = await this.prisma.reportRetention.update({
      where: { reportId },
      data: {
        expiresAt: newExpiresAt,
        retentionPeriod: retention.retentionPeriod + additionalDays,
      },
    });

    // Log the extension
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.RETENTION_POLICY,
        entityId: retention.id,
        action: RegulatoryAction.UPDATE,
        performedBy: 'system',
        previousState: { expiresAt: retention.expiresAt },
        newState: { expiresAt: newExpiresAt },
        reason: `Retention period extended: ${reason}`,
      },
    });

    this.logger.log(`Retention period extended for report ${reportId} to ${newExpiresAt}`);
    return updatedRetention;
  }

  // Mock implementations for archive operations
  private async compressAndEncryptReport(report: any): Promise<Buffer> {
    // Mock compression and encryption
    const reportData = JSON.stringify(report);
    return Buffer.from(reportData, 'utf8');
  }

  private async storeInArchive(data: Buffer, reportId: string): Promise<string> {
    // Mock storage - in production would use S3, Azure Blob, etc.
    const archiveLocation = `archive://regulatory-reports/${reportId}.enc`;
    this.logger.log(`Mock storing report ${reportId} to archive: ${archiveLocation}`);
    return archiveLocation;
  }

  private async deleteFromArchive(archiveLocation: string): Promise<void> {
    // Mock deletion from archive storage
    this.logger.log(`Mock deleting from archive: ${archiveLocation}`);
  }

  private async retrieveFromArchive(archiveLocation: string): Promise<Buffer> {
    // Mock retrieval from archive
    this.logger.log(`Mock retrieving from archive: ${archiveLocation}`);
    return Buffer.from('mock archive data', 'utf8');
  }

  private async decryptAndDecompressReport(data: Buffer): Promise<any> {
    // Mock decryption and decompression
    const reportData = data.toString('utf8');
    return JSON.parse(reportData);
  }

  private async restoreReportData(reportData: any): Promise<void> {
    // Mock restoration of report data
    this.logger.log(`Mock restoring report data for report ${reportData.id}`);
  }

  // Scheduled tasks
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyRetentionTasks() {
    this.logger.log('Running daily retention tasks');
    
    await this.archiveExpiredReports();
    await this.deleteScheduledReports();
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyRetentionCleanup() {
    this.logger.log('Running weekly retention cleanup');
    
    // Clean up any orphaned retention records
    const orphanedRetentions = await this.prisma.reportRetention.findMany({
      where: {
        report: null,
      },
    });

    if (orphanedRetentions.length > 0) {
      await this.prisma.reportRetention.deleteMany({
        where: {
          id: { in: orphanedRetentions.map(r => r.id) },
        },
      });
      
      this.logger.log(`Cleaned up ${orphanedRetentions.length} orphaned retention records`);
    }
  }
}
