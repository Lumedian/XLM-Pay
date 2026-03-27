import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RegulatoryReportingService } from '../regulatory-reporting.service';
import { 
  RegulatoryReportType, 
  ReportStatus, 
  ReportFormat,
  ComplianceCertificationType,
  ComplianceStatus,
  RegulatoryAction,
  RegulatoryEntityType 
} from '@prisma/client';
import { CreateComplianceReportDto, QuarterlyComplianceDto } from '../dto';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly regulatoryReportingService: RegulatoryReportingService,
  ) {}

  async createComplianceReport(createComplianceReportDto: CreateComplianceReportDto) {
    this.logger.log(`Creating compliance report with ${createComplianceReportDto.complianceItems.length} items`);

    const report = await this.regulatoryReportingService.createReport(
      RegulatoryReportType.COMPLIANCE_CERTIFICATION,
      'INTERNAL', // Internal compliance reporting
      {
        start: new Date(Math.min(...createComplianceReportDto.complianceItems.map(item => new Date(item.period.start).getTime()))),
        end: new Date(Math.max(...createComplianceReportDto.complianceItems.map(item => new Date(item.period.end).getTime()))),
      },
      ReportFormat.PDF,
    );

    const complianceItems = await Promise.all(
      createComplianceReportDto.complianceItems.map(item =>
        this.prisma.complianceReportItem.create({
          data: {
            reportId: report.id,
            certificationType: item.certificationType,
            period: item.period,
            certifiedBy: item.certifiedBy,
            certificationDate: item.certificationDate,
            findings: item.findings,
            recommendations: item.recommendations,
            approvedBy: item.approvedBy,
            approvedAt: item.approvedAt,
          },
        })
      )
    );

    // Update report with total records
    await this.prisma.regulatoryReport.update({
      where: { id: report.id },
      data: { totalRecords: complianceItems.length },
    });

    this.logger.log(`Compliance report created with ID: ${report.id}`);
    return { report, complianceItems };
  }

  async generateQuarterlyComplianceReport(quarter: string, year: number): Promise<QuarterlyComplianceDto> {
    this.logger.log(`Generating quarterly compliance report for ${quarter} ${year}`);

    const quarterDates = this.getQuarterDates(quarter, year);
    
    // Gather compliance data for the quarter
    const [amlProgram, kycCompliance, transactionMonitoring, reportingAdequacy] = await Promise.all([
      this.assessAMLProgram(quarterDates),
      this.assessKYCCompliance(quarterDates),
      this.assessTransactionMonitoring(quarterDates),
      this.assessReportingAdequacy(quarterDates),
    ]);

    const quarterlyReport: QuarterlyComplianceDto = {
      quarter: `${quarter} ${year}`,
      quarterStart: quarterDates.start,
      quarterEnd: quarterDates.end,
      amlProgram,
      kycCompliance,
      transactionMonitoring,
      reportingAdequacy,
    };

    return quarterlyReport;
  }

  async submitQuarterlyCertification(quarterlyReport: QuarterlyComplianceDto, certifiedBy: string) {
    this.logger.log(`Submitting quarterly certification for ${quarterlyReport.quarter}`);

    const report = await this.regulatoryReportingService.createReport(
      RegulatoryReportType.QUARTERLY_FILING,
      'INTERNAL',
      {
        start: quarterlyReport.quarterStart,
        end: quarterlyReport.quarterEnd,
      },
      ReportFormat.PDF,
    );

    // Create compliance items for each certification type
    const complianceItems = await Promise.all([
      this.prisma.complianceReportItem.create({
        data: {
          reportId: report.id,
          certificationType: ComplianceCertificationType.AML_PROGRAM,
          period: { start: quarterlyReport.quarterStart, end: quarterlyReport.quarterEnd },
          certifiedBy,
          certificationDate: new Date(),
          status: ComplianceStatus.CERTIFIED,
          findings: quarterlyReport.amlProgram,
        },
      }),
      this.prisma.complianceReportItem.create({
        data: {
          reportId: report.id,
          certificationType: ComplianceCertificationType.KYC_COMPLIANCE,
          period: { start: quarterlyReport.quarterStart, end: quarterlyReport.quarterEnd },
          certifiedBy,
          certificationDate: new Date(),
          status: ComplianceStatus.CERTIFIED,
          findings: quarterlyReport.kycCompliance,
        },
      }),
      this.prisma.complianceReportItem.create({
        data: {
          reportId: report.id,
          certificationType: ComplianceCertificationType.TRANSACTION_MONITORING,
          period: { start: quarterlyReport.quarterStart, end: quarterlyReport.quarterEnd },
          certifiedBy,
          certificationDate: new Date(),
          status: ComplianceStatus.CERTIFIED,
          findings: quarterlyReport.transactionMonitoring,
        },
      }),
      this.prisma.complianceReportItem.create({
        data: {
          reportId: report.id,
          certificationType: ComplianceCertificationType.REPORTING_ADEQUACY,
          period: { start: quarterlyReport.quarterStart, end: quarterlyReport.quarterEnd },
          certifiedBy,
          certificationDate: new Date(),
          status: ComplianceStatus.CERTIFIED,
          findings: quarterlyReport.reportingAdequacy,
        },
      }),
    ]);

    // Update report status
    await this.regulatoryReportingService.updateReportStatus(
      report.id,
      ReportStatus.SUBMITTED,
      `Quarterly certification submitted for ${quarterlyReport.quarter}`,
    );

    return { report, complianceItems };
  }

  async approveComplianceItem(itemId: string, approvedBy: string): Promise<any> {
    this.logger.log(`Approving compliance item ${itemId} by user ${approvedBy}`);

    const item = await this.prisma.complianceReportItem.findUnique({
      where: { id: itemId },
      include: { report: true },
    });

    if (!item) {
      throw new Error(`Compliance item ${itemId} not found`);
    }

    if (item.status !== ComplianceStatus.PENDING) {
      throw new Error(`Compliance item ${itemId} is not pending approval`);
    }

    const updatedItem = await this.prisma.complianceReportItem.update({
      where: { id: itemId },
      data: {
        status: ComplianceStatus.CERTIFIED,
        approvedBy,
        approvedAt: new Date(),
      },
    });

    // Log the approval
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.COMPLIANCE_ITEM,
        entityId: itemId,
        action: RegulatoryAction.UPDATE,
        performedBy: approvedBy,
        previousState: { status: item.status },
        newState: { status: ComplianceStatus.CERTIFIED, approvedBy },
        reason: 'Compliance item approved',
      },
    });

    return updatedItem;
  }

  async getComplianceReportsByType(certificationType: ComplianceCertificationType) {
    return this.prisma.complianceReportItem.findMany({
      where: { certificationType },
      include: { report: true },
      orderBy: { certificationDate: 'desc' },
    });
  }

  async getComplianceReportsByPeriod(startDate: Date, endDate: Date) {
    return this.prisma.complianceReportItem.findMany({
      where: {
        period: {
          start: { gte: startDate },
          end: { lte: endDate },
        },
      },
      include: { report: true },
      orderBy: { certificationDate: 'desc' },
    });
  }

  async getComplianceStatistics() {
    const [
      totalCertifications,
      pendingCertifications,
      certifiedCertifications,
      rejectedCertifications,
      expiredCertifications,
    ] = await Promise.all([
      this.prisma.complianceReportItem.count(),
      this.prisma.complianceReportItem.count({ where: { status: ComplianceStatus.PENDING } }),
      this.prisma.complianceReportItem.count({ where: { status: ComplianceStatus.CERTIFIED } }),
      this.prisma.complianceReportItem.count({ where: { status: ComplianceStatus.REJECTED } }),
      this.prisma.complianceReportItem.count({ where: { status: ComplianceStatus.EXPIRED } }),
    ]);

    return {
      total: totalCertifications,
      pending: pendingCertifications,
      certified: certifiedCertifications,
      rejected: rejectedCertifications,
      expired: expiredCertifications,
      certificationRate: totalCertifications > 0 ? (certifiedCertifications / totalCertifications) * 100 : 0,
    };
  }

  private async assessAMLProgram(quarterDates: { start: Date; end: Date }) {
    // Mock AML program assessment
    const totalCustomers = await this.prisma.user.count();
    const riskAssessments = 42; // Mock data
    const policyUpdates = 3;
    const trainingSessions = 12;
    const auditFindings = 2;

    const score = Math.max(0, 100 - (auditFindings * 5)); // Simple scoring

    return {
      status: ComplianceStatus.CERTIFIED,
      score,
      lastAudit: new Date(quarterDates.end.getTime() - 7 * 24 * 60 * 60 * 1000), // 1 week before quarter end
      nextAudit: new Date(quarterDates.end.getTime() + 90 * 24 * 60 * 60 * 1000), // 90 days after quarter end
      totalCustomers,
      riskAssessments,
      policyUpdates,
      trainingSessions,
      auditFindings,
      recommendations: auditFindings > 0 ? [
        'Address audit findings promptly',
        'Enhance customer due diligence procedures',
        'Update risk assessment methodology',
      ] : [],
    };
  }

  private async assessKYCCompliance(quarterDates: { start: Date; end: Date }) {
    // Mock KYC compliance assessment
    const totalCustomers = await this.prisma.user.count();
    const verifiedCustomers = Math.floor(totalCustomers * 0.97); // 97% verification rate
    const pendingVerifications = totalCustomers - verifiedCustomers;
    const highRiskCustomers = Math.floor(totalCustomers * 0.05); // 5% high risk
    const enhancedDueDiligence = Math.floor(highRiskCustomers * 0.8); // 80% of high risk have EDD

    const complianceRate = (verifiedCustomers / totalCustomers) * 100;

    return {
      status: complianceRate >= 95 ? ComplianceStatus.CERTIFIED : ComplianceStatus.PENDING,
      totalCustomers,
      verifiedCustomers,
      pendingVerifications,
      highRiskCustomers,
      enhancedDueDiligence,
      complianceRate,
      averageVerificationTime: 2.5, // days
      recommendations: complianceRate < 95 ? [
        'Accelerate verification process',
        'Implement automated verification',
        'Reduce manual review backlog',
      ] : [],
    };
  }

  private async assessTransactionMonitoring(quarterDates: { start: Date; end: Date }) {
    // Mock transaction monitoring assessment
    const totalTransactions = 100000; // Mock data
    const alertsGenerated = 1250;
    const falsePositives = 950;
    const genuineAlerts = alertsGenerated - falsePositives;
    const sarFiled = 25;
    const averageAlertResolutionTime = 4.2; // hours

    const alertAccuracy = (genuineAlerts / alertsGenerated) * 100;
    const filingRate = (sarFiled / genuineAlerts) * 100;

    return {
      status: alertAccuracy >= 20 ? ComplianceStatus.CERTIFIED : ComplianceStatus.PENDING,
      totalTransactions,
      alertsGenerated,
      falsePositives,
      genuineAlerts,
      sarFiled,
      alertAccuracy,
      filingRate,
      averageAlertResolutionTime,
      recommendations: alertAccuracy < 20 ? [
        'Refine monitoring rules',
        'Improve false positive detection',
        'Enhance pattern recognition',
      ] : [],
    };
  }

  private async assessReportingAdequacy(quarterDates: { start: Date; end: Date }) {
    // Mock reporting adequacy assessment
    const regulatoryReportsFiled = 12;
    const filingAccuracy = 99.8;
    const timelinessScore = 100;
    const regulatoryFeedback = 'COMPLIANT';
    const lateFilings = 0;
    const rejectedFilings = 0;

    return {
      status: filingAccuracy >= 99 && timelinessScore >= 95 ? ComplianceStatus.CERTIFIED : ComplianceStatus.PENDING,
      regulatoryReportsFiled,
      filingAccuracy,
      timelinessScore,
      regulatoryFeedback,
      lateFilings,
      rejectedFilings,
      averageFilingTime: 2.1, // days before deadline
      recommendations: filingAccuracy < 99 ? [
        'Improve data validation',
        'Enhance quality control processes',
        'Implement pre-filing checks',
      ] : [],
    };
  }

  private getQuarterDates(quarter: string, year: number): { start: Date; end: Date } {
    const quarterMap: Record<string, { start: number; end: number }> = {
      'Q1': { start: 0, end: 2 }, // Jan-Mar
      'Q2': { start: 3, end: 5 }, // Apr-Jun
      'Q3': { start: 6, end: 8 }, // Jul-Sep
      'Q4': { start: 9, end: 11 }, // Oct-Dec
    };

    const quarterInfo = quarterMap[quarter];
    if (!quarterInfo) {
      throw new Error(`Invalid quarter: ${quarter}`);
    }

    const start = new Date(year, quarterInfo.start, 1);
    const end = new Date(year, quarterInfo.end + 1, 0, 23, 59, 59, 999); // Last day of quarter

    return { start, end };
  }

  async scheduleQuarterlyCertifications() {
    this.logger.log('Scheduling quarterly compliance certifications');

    const currentYear = new Date().getFullYear();
    const currentQuarter = this.getCurrentQuarter();

    // Schedule certification for previous quarter if not already done
    const previousQuarter = this.getPreviousQuarter(currentQuarter);
    const previousQuarterDates = this.getQuarterDates(previousQuarter, currentYear);

    const existingReport = await this.prisma.regulatoryReport.findFirst({
      where: {
        reportType: RegulatoryReportType.QUARTERLY_FILING,
        reportPeriod: {
          start: previousQuarterDates.start,
          end: previousQuarterDates.end,
        },
      },
    });

    if (!existingReport) {
      this.logger.log(`Scheduling certification for ${previousQuarter} ${currentYear}`);
      
      // Generate and submit the quarterly certification
      const quarterlyReport = await this.generateQuarterlyComplianceReport(previousQuarter, currentYear);
      
      // This would typically be done by a compliance officer
      // For now, we'll use a system user
      await this.submitQuarterlyCertification(quarterlyReport, 'system_compliance_bot');
    }
  }

  private getCurrentQuarter(): string {
    const month = new Date().getMonth();
    if (month <= 2) return 'Q1';
    if (month <= 5) return 'Q2';
    if (month <= 8) return 'Q3';
    return 'Q4';
  }

  private getPreviousQuarter(currentQuarter: string): string {
    const quarterOrder = ['Q1', 'Q2', 'Q3', 'Q4'];
    const currentIndex = quarterOrder.indexOf(currentQuarter);
    const previousIndex = currentIndex === 0 ? 3 : currentIndex - 1;
    return quarterOrder[previousIndex];
  }
}
