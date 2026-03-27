import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RegulatoryReportingService } from '../regulatory-reporting.service';
import { SuspiciousPatternDetectionService } from './suspicious-pattern-detection.service';
import { 
  RegulatoryReportType, 
  ReportStatus, 
  ReportFormat,
  SARStatus,
  SARPriority,
  RegulatoryAction,
  RegulatoryEntityType 
} from '@prisma/client';
import { CreateSARDto, SuspiciousActivityReportDto } from '../dto';

@Injectable()
export class SARService {
  private readonly logger = new Logger(SARService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly regulatoryReportingService: RegulatoryReportingService,
    private readonly suspiciousPatternDetection: SuspiciousPatternDetectionService,
  ) {}

  async createSAR(createSARDto: CreateSARDto) {
    this.logger.log(`Creating SAR for report ${createSARDto.reportId}`);

    const report = await this.regulatoryReportingService.createReport(
      RegulatoryReportType.SUSPICIOUS_ACTIVITY,
      'FINRA', // Default jurisdiction for SARs
      {
        start: createSARDto.sar.timeframe.start,
        end: createSARDto.sar.timeframe.end,
      },
      ReportFormat.PDF,
    );

    const sar = await this.prisma.suspiciousActivityReport.create({
      data: {
        reportId: report.id,
        sarId: createSARDto.sar.sarId,
        filingDate: createSARDto.sar.filingDate,
        suspiciousAmount: createSARDto.sar.suspiciousAmount,
        activityType: createSARDto.sar.activityType,
        involvedAddresses: createSARDto.sar.involvedAddresses,
        timeframe: createSARDto.sar.timeframe,
        narrative: createSARDto.sar.narrative,
        confidence: createSARDto.sar.confidence,
        investigationId: createSARDto.sar.investigationId,
        priority: createSARDto.sar.priority,
      },
    });

    // Update report with total records
    await this.prisma.regulatoryReport.update({
      where: { id: report.id },
      data: { totalRecords: 1 },
    });

    this.logger.log(`SAR created with ID: ${sar.id}`);
    return { report, sar };
  }

  async generateSARFromPattern(pattern: any, investigationId?: string): Promise<any> {
    this.logger.log(`Generating SAR from detected pattern: ${pattern.patternType}`);

    // Generate SAR ID
    const sarId = this.generateSARId();

    // Create SAR report
    const report = await this.regulatoryReportingService.createReport(
      RegulatoryReportType.SUSPICIOUS_ACTIVITY,
      'FINRA',
      pattern.timeframe,
      ReportFormat.PDF,
    );

    // Determine activity type and priority based on pattern
    const activityType = this.mapPatternToActivityType(pattern.patternType);
    const priority = this.mapPatternToPriority(pattern.confidence);

    const sar = await this.prisma.suspiciousActivityReport.create({
      data: {
        reportId: report.id,
        sarId,
        filingDate: new Date(),
        suspiciousAmount: pattern.details.totalAmount || 0,
        activityType,
        involvedAddresses: pattern.addresses,
        timeframe: pattern.timeframe,
        narrative: this.generateNarrativeFromPattern(pattern),
        confidence: pattern.confidence,
        investigationId,
        priority,
        status: SARStatus.PENDING,
      },
    });

    // Update report
    await this.prisma.regulatoryReport.update({
      where: { id: report.id },
      data: { totalRecords: 1 },
    });

    this.logger.log(`SAR generated from pattern: ${sarId}`);
    return { report, sar };
  }

  async submitSAR(sarId: string): Promise<{ submissionId: string; status: string }> {
    this.logger.log(`Submitting SAR ${sarId} to regulatory authorities`);

    const sar = await this.prisma.suspiciousActivityReport.findUnique({
      where: { id: sarId },
      include: { report: true },
    });

    if (!sar) {
      throw new Error(`SAR ${sarId} not found`);
    }

    if (sar.status !== SARStatus.PENDING) {
      throw new Error(`SAR ${sarId} is not in pending status`);
    }

    // Generate SAR in required format (mock implementation)
    const sarData = await this.generateSARFormat(sar);

    // Submit to regulatory authority (mock)
    const submissionId = await this.submitToRegulatoryAuthority(sarData);

    // Update SAR status
    await this.prisma.suspiciousActivityReport.update({
      where: { id: sarId },
      data: {
        status: SARStatus.FILED,
      },
    });

    // Update report status
    await this.regulatoryReportingService.updateReportStatus(
      sar.reportId,
      ReportStatus.SUBMITTED,
      `SAR submitted with submission ID: ${submissionId}`,
    );

    return { submissionId, status: 'FILED' };
  }

  async acknowledgeSAR(sarId: string, acknowledgmentData: any): Promise<any> {
    this.logger.log(`Acknowledging SAR ${sarId}`);

    const sar = await this.prisma.suspiciousActivityReport.update({
      where: { id: sarId },
      data: {
        status: SARStatus.ACKNOWLEDGED,
      },
    });

    // Update report status
    await this.regulatoryReportingService.updateReportStatus(
      sar.reportId,
      ReportStatus.ACKNOWLEDGED,
      `SAR acknowledged by regulatory authority`,
    );

    return sar;
  }

  async getSARsByStatus(status: SARStatus) {
    return this.prisma.suspiciousActivityReport.findMany({
      where: { status },
      include: { report: true },
      orderBy: { filingDate: 'desc' },
    });
  }

  async getSARsByPriority(priority: SARPriority) {
    return this.prisma.suspiciousActivityReport.findMany({
      where: { priority },
      include: { report: true },
      orderBy: { filingDate: 'desc' },
    });
  }

  async getSARsByActivityType(activityType: any) {
    return this.prisma.suspiciousActivityReport.findMany({
      where: { activityType },
      include: { report: true },
      orderBy: { filingDate: 'desc' },
    });
  }

  async getSARsByDateRange(startDate: Date, endDate: Date) {
    return this.prisma.suspiciousActivityReport.findMany({
      where: {
        filingDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { report: true },
      orderBy: { filingDate: 'desc' },
    });
  }

  async getSARsByAddress(address: string) {
    return this.prisma.suspiciousActivityReport.findMany({
      where: {
        involvedAddresses: {
          has: address,
        },
      },
      include: { report: true },
      orderBy: { filingDate: 'desc' },
    });
  }

  async getSARStatistics() {
    const [
      totalSARs,
      pendingSARs,
      filedSARs,
      acknowledgedSARs,
      investigationSARs,
      resolvedSARs,
      rejectedSARs,
    ] = await Promise.all([
      this.prisma.suspiciousActivityReport.count(),
      this.prisma.suspiciousActivityReport.count({ where: { status: SARStatus.PENDING } }),
      this.prisma.suspiciousActivityReport.count({ where: { status: SARStatus.FILED } }),
      this.prisma.suspiciousActivityReport.count({ where: { status: SARStatus.ACKNOWLEDGED } }),
      this.prisma.suspiciousActivityReport.count({ where: { status: SARStatus.INVESTIGATION } }),
      this.prisma.suspiciousActivityReport.count({ where: { status: SARStatus.RESOLVED } }),
      this.prisma.suspiciousActivityReport.count({ where: { status: SARStatus.REJECTED } }),
    ]);

    // Get SARs by priority
    const [highPrioritySARs, mediumPrioritySARs, lowPrioritySARs, criticalPrioritySARs] = await Promise.all([
      this.prisma.suspiciousActivityReport.count({ where: { priority: SARPriority.HIGH } }),
      this.prisma.suspiciousActivityReport.count({ where: { priority: SARPriority.MEDIUM } }),
      this.prisma.suspiciousActivityReport.count({ where: { priority: SARPriority.LOW } }),
      this.prisma.suspiciousActivityReport.count({ where: { priority: SARPriority.CRITICAL } }),
    ]);

    return {
      total: totalSARs,
      pending: pendingSARs,
      filed: filedSARs,
      acknowledged: acknowledgedSARs,
      investigation: investigationSARs,
      resolved: resolvedSARs,
      rejected: rejectedSARs,
      byPriority: {
        critical: criticalPrioritySARs,
        high: highPrioritySARs,
        medium: mediumPrioritySARs,
        low: lowPrioritySARs,
      },
      filingRate: totalSARs > 0 ? (filedSARs / totalSARs) * 100 : 0,
      acknowledgmentRate: filedSARs > 0 ? (acknowledgedSARs / filedSARs) * 100 : 0,
    };
  }

  async batchGenerateSARs(patterns: any[]): Promise<any[]> {
    this.logger.log(`Batch generating SARs from ${patterns.length} patterns`);

    const results = [];

    for (const pattern of patterns) {
      try {
        const result = await this.generateSARFromPattern(pattern);
        results.push(result);
      } catch (error) {
        this.logger.error(`Failed to generate SAR from pattern: ${error.message}`);
        // Continue with other patterns
      }
    }

    this.logger.log(`Batch SAR generation completed: ${results.length} SARs created`);
    return results;
  }

  private generateSARId(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `SAR-${date}-${random}`;
  }

  private mapPatternToActivityType(patternType: string): any {
    const mapping: Record<string, any> = {
      'LARGE_TRANSACTIONS': 'LARGE_TRANSACTIONS',
      'FREQUENT_SMALL_TRANSACTIONS': 'FREQUENT_SMALL_TRANSACTIONS',
      'STRUCTURING_BELOW_THRESHOLD': 'STRUCTURING',
      'UNUSUAL_VOLUME_PATTERN': 'UNUSUAL_PATTERN',
      'CIRCULAR_TRANSACTIONS': 'MONEY_LAUNDERING',
      'RAPID_FIRE_TRADING': 'MARKET_MANIPULATION',
      'WASH_TRADING': 'MARKET_MANIPULATION',
    };

    return mapping[patternType] || 'OTHER';
  }

  private mapPatternToPriority(confidence: string): SARPriority {
    switch (confidence) {
      case 'CRITICAL':
        return SARPriority.CRITICAL;
      case 'HIGH':
        return SARPriority.HIGH;
      case 'MEDIUM':
        return SARPriority.MEDIUM;
      case 'LOW':
        return SARPriority.LOW;
      default:
        return SARPriority.MEDIUM;
    }
  }

  private generateNarrativeFromPattern(pattern: any): string {
    const narratives: Record<string, (pattern: any) => string> = {
      'LARGE_TRANSACTIONS': (p) => 
        `Detected large transaction activity involving ${p.details.totalTransactions} transactions totaling $${p.details.totalAmount.toLocaleString()}. Average transaction amount: $${p.details.averageTransactionAmount.toLocaleString()}. Activity exceeds $10,000 reporting threshold.`,

      'FREQUENT_SMALL_TRANSACTIONS': (p) => 
        `Detected pattern of frequent small transactions: ${p.details.totalTransactions} transactions totaling $${p.details.totalAmount.toLocaleString()} over ${p.details.frequency} transactions per day. Potential structuring activity detected.`,

      'STRUCTURING_BELOW_THRESHOLD': (p) => 
        `Detected potential structuring activity: ${p.details.totalTransactions} transactions totaling $${p.details.totalAmount.toLocaleString()} with amounts consistently under $10,000 threshold. Pattern suggests deliberate avoidance of reporting requirements.`,

      'UNUSUAL_VOLUME_PATTERN': (p) => 
        `Detected unusual trading pattern in ${p.details.symbol}. Transaction volumes significantly exceed normal patterns with ${p.details.unusualTransactions} outliers totaling $${p.details.totalUnusualVolume.toLocaleString()}. Deviation factor: ${p.details.standardDeviation}x from average.`,

      'CIRCULAR_TRANSACTIONS': (p) => 
        `Detected circular transaction pattern involving ${p.details.cycleLength} addresses. ${p.details.totalTransactions} transactions totaling $${p.details.totalVolume.toLocaleString()}. Pattern suggests potential money laundering or wash trading.`,

      'RAPID_FIRE_TRADING': (p) => 
        `Detected rapid-fire trading activity in ${p.details.symbol}: ${p.details.transactionCount} transactions within ${p.details.timeSpanMinutes} minutes totaling $${p.details.totalVolume.toLocaleString()}. Suggests potential market manipulation.`,

      'WASH_TRADING': (p) => 
        `Detected potential wash trading activity: ${p.details.totalTransactions} transactions totaling $${p.details.totalVolume.toLocaleString()} between related counterparties. Pattern suggests artificial trading activity.`,

      'default': (p) => 
        `Detected suspicious activity pattern: ${p.patternType}. ${p.details.totalTransactions} transactions totaling $${p.details.totalAmount?.toLocaleString() || 'N/A'}. Requires further investigation.`,
    };

    const generator = narratives[pattern.patternType] || narratives.default;
    return generator(pattern);
  }

  private async generateSARFormat(sar: any): Promise<any> {
    // Mock SAR format generation
    return {
      sarId: sar.sarId,
      filingDate: sar.filingDate,
      suspiciousActivity: {
        amount: sar.suspiciousAmount,
        type: sar.activityType,
        timeframe: sar.timeframe,
        narrative: sar.narrative,
      },
      involvedParties: sar.involvedAddresses,
      priority: sar.priority,
      confidence: sar.confidence,
      investigationId: sar.investigationId,
    };
  }

  private async submitToRegulatoryAuthority(sarData: any): Promise<string> {
    // Mock submission to regulatory authority
    const submissionId = `SAR_SUB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`Mock SAR submission with ID: ${submissionId}`);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return submissionId;
  }

  async updateSARStatus(sarId: string, status: SARStatus, reason?: string): Promise<any> {
    this.logger.log(`Updating SAR ${sarId} status to ${status}`);

    const sar = await this.prisma.suspiciousActivityReport.update({
      where: { id: sarId },
      data: { status },
    });

    // Log the status change
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.SAR,
        entityId: sarId,
        action: RegulatoryAction.UPDATE,
        performedBy: 'system',
        previousState: { status: SARStatus.PENDING },
        newState: { status },
        reason: reason || `SAR status updated to ${status}`,
      },
    });

    return sar;
  }

  async getSARInvestigationSummary(investigationId: string): Promise<any> {
    const sars = await this.prisma.suspiciousActivityReport.findMany({
      where: { investigationId },
      include: { report: true },
    });

    if (sars.length === 0) {
      throw new Error(`No SARs found for investigation ${investigationId}`);
    }

    const totalAmount = sars.reduce((sum, sar) => sum + parseFloat(sar.suspiciousAmount.toString()), 0);
    const uniqueAddresses = new Set(sars.flatMap(sar => sar.involvedAddresses)).size;

    return {
      investigationId,
      totalSARs: sars.length,
      totalSuspiciousAmount: totalAmount,
      uniqueAddresses,
      activityTypes: [...new Set(sars.map(sar => sar.activityType))],
      priorityDistribution: {
        critical: sars.filter(sar => sar.priority === SARPriority.CRITICAL).length,
        high: sars.filter(sar => sar.priority === SARPriority.HIGH).length,
        medium: sars.filter(sar => sar.priority === SARPriority.MEDIUM).length,
        low: sars.filter(sar => sar.priority === SARPriority.LOW).length,
      },
      statusDistribution: {
        pending: sars.filter(sar => sar.status === SARStatus.PENDING).length,
        filed: sars.filter(sar => sar.status === SARStatus.FILED).length,
        acknowledged: sars.filter(sar => sar.status === SARStatus.ACKNOWLEDGED).length,
        investigation: sars.filter(sar => sar.status === SARStatus.INVESTIGATION).length,
        resolved: sars.filter(sar => sar.status === SARStatus.RESOLVED).length,
      },
    };
  }
}
