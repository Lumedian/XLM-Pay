import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SuspiciousPatternDetectionService } from '../services/suspicious-pattern-detection.service';
import { SARService } from '../services/sar.service';
import { 
  SARStatus,
  SARPriority,
  RegulatoryEntityType,
  RegulatoryAction 
} from '@prisma/client';

@Injectable()
export class SARBatchProcessor {
  private readonly logger = new Logger(SARBatchProcessor.name);
  private readonly BATCH_SIZE = 50;
  private readonly MAX_CONCURRENT_BATCHES = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly patternDetection: SuspiciousPatternDetectionService,
    private readonly sarService: SARService,
  ) {}

  async processBatchSARGeneration(startDate: Date, endDate: Date): Promise<any> {
    this.logger.log(`Starting batch SAR generation for period ${startDate} to ${endDate}`);

    try {
      // Step 1: Detect suspicious patterns
      const patterns = await this.patternDetection.detectSuspiciousPatterns(startDate, endDate);
      this.logger.log(`Detected ${patterns.length} suspicious patterns`);

      // Step 2: Filter high-priority patterns for immediate SAR generation
      const highPriorityPatterns = patterns.filter(pattern => 
        pattern.confidence === 'HIGH' || pattern.confidence === 'CRITICAL'
      );

      this.logger.log(`Found ${highPriorityPatterns.length} high-priority patterns for immediate SAR generation`);

      // Step 3: Generate SARs in batches
      const sarResults = await this.generateSARsInBatches(highPriorityPatterns);

      // Step 4: Queue medium priority patterns for review
      const mediumPriorityPatterns = patterns.filter(pattern => pattern.confidence === 'MEDIUM');
      await this.queuePatternsForReview(mediumPriorityPatterns);

      // Step 5: Log low priority patterns for monitoring
      const lowPriorityPatterns = patterns.filter(pattern => pattern.confidence === 'LOW');
      await this.logLowPriorityPatterns(lowPriorityPatterns);

      const results = {
        totalPatterns: patterns.length,
        highPriorityPatterns: highPriorityPatterns.length,
        mediumPriorityPatterns: mediumPriorityPatterns.length,
        lowPriorityPatterns: lowPriorityPatterns.length,
        sarGenerated: sarResults.length,
        sarFailed: sarResults.filter(r => r.success === false).length,
        queuedForReview: mediumPriorityPatterns.length,
        processingTime: new Date(),
      };

      this.logger.log(`Batch SAR generation completed: ${JSON.stringify(results)}`);
      return results;

    } catch (error) {
      this.logger.error(`Batch SAR generation failed: ${error.message}`);
      throw error;
    }
  }

  private async generateSARsInBatches(patterns: any[]): Promise<any[]> {
    const results = [];
    const totalBatches = Math.ceil(patterns.length / this.BATCH_SIZE);

    this.logger.log(`Processing ${totalBatches} batches for SAR generation`);

    // Process batches with concurrency control
    const batches = [];
    for (let i = 0; i < totalBatches; i++) {
      const start = i * this.BATCH_SIZE;
      const end = start + this.BATCH_SIZE;
      batches.push(patterns.slice(start, end));
    }

    // Process batches with limited concurrency
    for (let i = 0; i < batches.length; i += this.MAX_CONCURRENT_BATCHES) {
      const concurrentBatches = batches.slice(i, i + this.MAX_CONCURRENT_BATCHES);
      
      const batchPromises = concurrentBatches.map((batch, batchIndex) => 
        this.processSARBatch(batch, i + batchIndex)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        } else {
          this.logger.error(`Batch processing failed: ${result.reason}`);
          results.push({ success: false, error: result.reason.message });
        }
      }

      // Add delay between batch groups to prevent overwhelming
      if (i + this.MAX_CONCURRENT_BATCHES < batches.length) {
        await this.delay(1000); // 1 second delay
      }
    }

    return results;
  }

  private async processSARBatch(patterns: any[], batchNumber: number): Promise<any[]> {
    this.logger.log(`Processing SAR batch ${batchNumber} with ${patterns.length} patterns`);

    const results = [];

    for (const pattern of patterns) {
      try {
        // Generate investigation ID if not provided
        const investigationId = pattern.details.investigationId || this.generateInvestigationId();

        // Generate SAR from pattern
        const sarResult = await this.sarService.generateSARFromPattern(pattern, investigationId);
        
        results.push({
          success: true,
          patternId: pattern.patternType,
          sarId: sarResult.sar.sarId,
          investigationId,
          priority: sarResult.sar.priority,
        });

        this.logger.log(`Generated SAR ${sarResult.sar.sarId} for pattern ${pattern.patternType}`);

      } catch (error) {
        this.logger.error(`Failed to generate SAR for pattern ${pattern.patternType}: ${error.message}`);
        
        results.push({
          success: false,
          patternId: pattern.patternType,
          error: error.message,
        });
      }
    }

    this.logger.log(`Completed SAR batch ${batchNumber}: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  private async queuePatternsForReview(patterns: any[]): Promise<void> {
    this.logger.log(`Queueing ${patterns.length} medium priority patterns for review`);

    for (const pattern of patterns) {
      try {
        // Create a review task
        await this.prisma.regulatoryAuditTrail.create({
          data: {
            entityType: RegulatoryEntityType.SAR,
            entityId: `PATTERN_${pattern.patternType}_${Date.now()}`,
            action: RegulatoryAction.CREATE,
            performedBy: 'system',
            previousState: null,
            newState: {
              patternType: pattern.patternType,
              confidence: pattern.confidence,
              addresses: pattern.addresses,
              timeframe: pattern.timeframe,
              status: 'QUEUED_FOR_REVIEW',
            },
            reason: 'Medium priority pattern queued for manual review',
          },
        });

      } catch (error) {
        this.logger.error(`Failed to queue pattern for review: ${error.message}`);
      }
    }
  }

  private async logLowPriorityPatterns(patterns: any[]): Promise<void> {
    this.logger.log(`Logging ${patterns.length} low priority patterns for monitoring`);

    for (const pattern of patterns) {
      try {
        // Log for monitoring and future analysis
        await this.prisma.regulatoryAuditTrail.create({
          data: {
            entityType: RegulatoryEntityType.SAR,
            entityId: `PATTERN_${pattern.patternType}_${Date.now()}`,
            action: RegulatoryAction.CREATE,
            performedBy: 'system',
            previousState: null,
            newState: {
              patternType: pattern.patternType,
              confidence: pattern.confidence,
              addresses: pattern.addresses,
              timeframe: pattern.timeframe,
              status: 'LOW_PRIORITY_MONITORING',
            },
            reason: 'Low priority pattern logged for monitoring',
          },
        });

      } catch (error) {
        this.logger.error(`Failed to log low priority pattern: ${error.message}`);
      }
    }
  }

  async processBatchSARSubmission(): Promise<any> {
    this.logger.log('Starting batch SAR submission process');

    try {
      // Get all pending SARs
      const pendingSARs = await this.prisma.suspiciousActivityReport.findMany({
        where: { status: SARStatus.PENDING },
        include: { report: true },
        orderBy: { priority: 'desc' }, // Process high priority first
      });

      this.logger.log(`Found ${pendingSARs.length} pending SARs for submission`);

      if (pendingSARs.length === 0) {
        return { submitted: 0, failed: 0, skipped: 0 };
      }

      // Group SARs by priority for processing
      const criticalSARs = pendingSARs.filter(sar => sar.priority === SARPriority.CRITICAL);
      const highSARs = pendingSARs.filter(sar => sar.priority === SARPriority.HIGH);
      const mediumSARs = pendingSARs.filter(sar => sar.priority === SARPriority.MEDIUM);
      const lowSARs = pendingSARs.filter(sar => sar.priority === SARPriority.LOW);

      const results = {
        submitted: 0,
        failed: 0,
        skipped: 0,
        byPriority: {
          critical: { total: criticalSARs.length, processed: 0 },
          high: { total: highSARs.length, processed: 0 },
          medium: { total: mediumSARs.length, processed: 0 },
          low: { total: lowSARs.length, processed: 0 },
        },
      };

      // Process by priority order
      const priorityGroups = [
        { sars: criticalSARs, priority: 'critical', immediate: true },
        { sars: highSARs, priority: 'high', immediate: true },
        { sars: mediumSARs, priority: 'medium', immediate: false },
        { sars: lowSARs, priority: 'low', immediate: false },
      ];

      for (const group of priorityGroups) {
        const groupResults = await this.processSARGroup(group.sars, group.priority, group.immediate);
        
        results.submitted += groupResults.submitted;
        results.failed += groupResults.failed;
        results.skipped += groupResults.skipped;
        results.byPriority[group.priority].processed = groupResults.processed;
      }

      this.logger.log(`Batch SAR submission completed: ${JSON.stringify(results)}`);
      return results;

    } catch (error) {
      this.logger.error(`Batch SAR submission failed: ${error.message}`);
      throw error;
    }
  }

  private async processSARGroup(sars: any[], priority: string, immediate: boolean): Promise<any> {
    this.logger.log(`Processing ${sars.length} ${priority} priority SARs (immediate: ${immediate})`);

    const results = { submitted: 0, failed: 0, skipped: 0, processed: 0 };

    for (const sar of sars) {
      try {
        // Check if SAR should be processed immediately
        if (!immediate && !this.shouldProcessSAR(sar)) {
          results.skipped++;
          continue;
        }

        // Submit SAR
        const submissionResult = await this.sarService.submitSAR(sar.id);
        results.submitted++;
        results.processed++;

        this.logger.log(`Submitted ${priority} priority SAR ${sar.sarId}: ${submissionResult.submissionId}`);

        // Add delay between submissions to respect rate limits
        if (immediate) {
          await this.delay(500); // 500ms for immediate submissions
        } else {
          await this.delay(2000); // 2 seconds for batch submissions
        }

      } catch (error) {
        this.logger.error(`Failed to submit ${priority} priority SAR ${sar.sarId}: ${error.message}`);
        results.failed++;
        
        // Update SAR status to indicate failure
        await this.prisma.suspiciousActivityReport.update({
          where: { id: sar.id },
          data: { status: SARStatus.REJECTED },
        });
      }
    }

    return results;
  }

  private shouldProcessSAR(sar: any): boolean {
    // Business logic for determining if SAR should be processed
    const now = new Date();
    const filingDate = new Date(sar.filingDate);
    
    // Process SARs filed more than 1 hour ago (for non-immediate processing)
    const timeSinceFiling = now.getTime() - filingDate.getTime();
    const oneHour = 60 * 60 * 1000;
    
    return timeSinceFiling > oneHour;
  }

  async processBatchSARAcknowledgment(): Promise<any> {
    this.logger.log('Starting batch SAR acknowledgment processing');

    try {
      // Get all filed SARs that haven't been acknowledged
      const filedSARs = await this.prisma.suspiciousActivityReport.findMany({
        where: { status: SARStatus.FILED },
        include: { report: true },
      });

      this.logger.log(`Found ${filedSARs.length} filed SARs to check for acknowledgment`);

      const results = {
        checked: filedSARs.length,
        acknowledged: 0,
        stillPending: 0,
        errors: 0,
      };

      for (const sar of filedSARs) {
        try {
          // Check for acknowledgment (mock implementation)
          const acknowledgment = await this.checkSARAcknowledgment(sar);
          
          if (acknowledgment.acknowledged) {
            await this.sarService.acknowledgeSAR(sar.id, acknowledgment.data);
            results.acknowledged++;
            
            this.logger.log(`SAR ${sar.sarId} acknowledged`);
          } else {
            results.stillPending++;
          }

        } catch (error) {
          this.logger.error(`Failed to check acknowledgment for SAR ${sar.sarId}: ${error.message}`);
          results.errors++;
        }

        // Add delay to avoid overwhelming external systems
        await this.delay(1000);
      }

      this.logger.log(`Batch SAR acknowledgment completed: ${JSON.stringify(results)}`);
      return results;

    } catch (error) {
      this.logger.error(`Batch SAR acknowledgment failed: ${error.message}`);
      throw error;
    }
  }

  private async checkSARAcknowledgment(sar: any): Promise<{ acknowledged: boolean; data?: any }> {
    // Mock implementation - in production would query regulatory authority systems
    const timeSinceFiling = Date.now() - new Date(sar.filingDate).getTime();
    const twoDays = 2 * 24 * 60 * 60 * 1000;

    // Simulate acknowledgment after 2 days
    if (timeSinceFiling > twoDays) {
      return {
        acknowledged: true,
        data: {
          acknowledgmentDate: new Date(),
          acknowledgmentId: `ACK_${sar.sarId}_${Date.now()}`,
          status: 'RECEIVED',
        },
      };
    }

    return { acknowledged: false };
  }

  async getSARBatchStatistics(): Promise<any> {
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
    const [criticalSARs, highSARs, mediumSARs, lowSARs] = await Promise.all([
      this.prisma.suspiciousActivityReport.count({ where: { priority: SARPriority.CRITICAL } }),
      this.prisma.suspiciousActivityReport.count({ where: { priority: SARPriority.HIGH } }),
      this.prisma.suspiciousActivityReport.count({ where: { priority: SARPriority.MEDIUM } }),
      this.prisma.suspiciousActivityReport.count({ where: { priority: SARPriority.LOW } }),
    ]);

    // Get recent activity
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSARs = await this.prisma.suspiciousActivityReport.count({
      where: {
        createdAt: { gte: last24Hours },
      },
    });

    return {
      total: totalSARs,
      byStatus: {
        pending: pendingSARs,
        filed: filedSARs,
        acknowledged: acknowledgedSARs,
        investigation: investigationSARs,
        resolved: resolvedSARs,
        rejected: rejectedSARs,
      },
      byPriority: {
        critical: criticalSARs,
        high: highSARs,
        medium: mediumSARs,
        low: lowSARs,
      },
      recentActivity: {
        last24Hours: recentSARs,
        filingRate: totalSARs > 0 ? (filedSARs / totalSARs) * 100 : 0,
        acknowledgmentRate: filedSARs > 0 ? (acknowledgedSARs / filedSARs) * 100 : 0,
      },
    };
  }

  private generateInvestigationId(): string {
    return `INV_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async optimizeBatchProcessing(): Promise<void> {
    this.logger.log('Optimizing SAR batch processing');

    // Analyze current processing patterns
    const stats = await this.getSARBatchStatistics();

    // Adjust batch sizes based on performance
    if (stats.recentActivity.last24Hours > 100) {
      this.logger.log('High SAR volume detected, optimizing batch sizes');
      // Increase batch size for high volume periods
      // This would be implemented with dynamic batch sizing
    }

    // Adjust processing schedules based on acknowledgment rates
    if (stats.recentActivity.acknowledgmentRate < 80) {
      this.logger.log('Low acknowledgment rate detected, adjusting processing schedule');
      // Implement more frequent acknowledgment checks
    }

    // Optimize priority processing
    if (stats.byPriority.critical > 0) {
      this.logger.log('Critical SARs detected, prioritizing immediate processing');
      // Ensure critical SARs are processed immediately
    }
  }
}
