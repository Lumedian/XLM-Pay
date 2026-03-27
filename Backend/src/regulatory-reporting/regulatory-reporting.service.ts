import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { 
  RegulatoryReportType, 
  ReportStatus, 
  ReportFormat,
  RegulatoryAction,
  RegulatoryEntityType 
} from '@prisma/client';

@Injectable()
export class RegulatoryReportingService {
  private readonly logger = new Logger(RegulatoryReportingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  async createReport(
    type: RegulatoryReportType,
    jurisdiction: string,
    reportPeriod: { start: Date; end: Date },
    format: ReportFormat = ReportFormat.XML,
  ) {
    this.logger.log(`Creating ${type} report for ${jurisdiction}`);
    
    try {
      const report = await this.prisma.regulatoryReport.create({
        data: {
          reportType: type,
          jurisdiction,
          reportPeriod,
          format,
          status: ReportStatus.PENDING,
          encryptedData: {},
          checksum: this.generateChecksum({}),
        },
        include: {
          tradeRecords: true,
          sarRecords: true,
          complianceItems: true,
        },
      });

      await this.audit.logRegulatoryAction(
        RegulatoryEntityType.REPORT,
        report.id,
        RegulatoryAction.CREATE,
        'system',
        null,
        { type, jurisdiction, reportPeriod },
      );

      return report;
    } catch (error) {
      this.logger.error(`Failed to create report: ${error.message}`);
      throw error;
    }
  }

  async getReport(id: string) {
    return this.prisma.regulatoryReport.findUnique({
      where: { id },
      include: {
        tradeRecords: true,
        sarRecords: true,
        complianceItems: true,
        retention: true,
      },
    });
  }

  async updateReportStatus(id: string, status: ReportStatus, reason?: string) {
    const previousReport = await this.prisma.regulatoryReport.findUnique({
      where: { id },
    });

    if (!previousReport) {
      throw new Error(`Report ${id} not found`);
    }

    const updatedReport = await this.prisma.regulatoryReport.update({
      where: { id },
      data: { 
        status,
        errorMessage: reason,
        ...(status === ReportStatus.SUBMITTED && { submittedAt: new Date() }),
        ...(status === ReportStatus.ACKNOWLEDGED && { acknowledgedAt: new Date() }),
      },
    });

    await this.audit.logRegulatoryAction(
      RegulatoryEntityType.REPORT,
      id,
      RegulatoryAction.UPDATE,
      'system',
      previousReport,
      { status, reason },
    );

    return updatedReport;
  }

  async getReportsByType(type: RegulatoryReportType, status?: ReportStatus) {
    return this.prisma.regulatoryReport.findMany({
      where: {
        reportType: type,
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        tradeRecords: true,
        sarRecords: true,
        complianceItems: true,
      },
    });
  }

  async getReportsByJurisdiction(jurisdiction: string, startDate?: Date, endDate?: Date) {
    return this.prisma.regulatoryReport.findMany({
      where: {
        jurisdiction,
        ...(startDate && endDate && {
          reportPeriod: {
            start: { gte: startDate },
            end: { lte: endDate },
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async retryFailedReport(id: string) {
    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id },
    });

    if (!report || report.status !== ReportStatus.FAILED) {
      throw new Error(`Cannot retry report ${id} - not in failed status`);
    }

    return this.prisma.regulatoryReport.update({
      where: { id },
      data: {
        status: ReportStatus.PENDING,
        retryCount: report.retryCount + 1,
        errorMessage: null,
      },
    });
  }

  async deleteReport(id: string) {
    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw new Error(`Report ${id} not found`);
    }

    // Soft delete by archiving
    await this.prisma.regulatoryReport.update({
      where: { id },
      data: { status: ReportStatus.ARCHIVED },
    });

    await this.audit.logRegulatoryAction(
      RegulatoryEntityType.REPORT,
      id,
      RegulatoryAction.ARCHIVE,
      'system',
      report,
      null,
    );
  }

  private generateChecksum(data: any): string {
    // Simple SHA-256 checksum implementation
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  async validateReportIntegrity(reportId: string): Promise<boolean> {
    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return false;
    }

    const expectedChecksum = this.generateChecksum(report.encryptedData);
    return expectedChecksum === report.checksum;
  }

  async getReportStatistics(jurisdiction?: string) {
    const where = jurisdiction ? { jurisdiction } : {};

    const [
      totalReports,
      pendingReports,
      submittedReports,
      acknowledgedReports,
      failedReports,
    ] = await Promise.all([
      this.prisma.regulatoryReport.count({ where }),
      this.prisma.regulatoryReport.count({ where: { ...where, status: ReportStatus.PENDING } }),
      this.prisma.regulatoryReport.count({ where: { ...where, status: ReportStatus.SUBMITTED } }),
      this.prisma.regulatoryReport.count({ where: { ...where, status: ReportStatus.ACKNOWLEDGED } }),
      this.prisma.regulatoryReport.count({ where: { ...where, status: ReportStatus.FAILED } }),
    ]);

    return {
      total: totalReports,
      pending: pendingReports,
      submitted: submittedReports,
      acknowledged: acknowledgedReports,
      failed: failedReports,
      successRate: totalReports > 0 ? (acknowledgedReports / totalReports) * 100 : 0,
    };
  }
}
