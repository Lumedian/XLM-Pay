import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { 
  ReportStatus,
  RegulatoryEntityType,
  RegulatoryAction 
} from '@prisma/client';

@Injectable()
export class LargeTradeReportProcessor {
  private readonly logger = new Logger(LargeTradeReportProcessor.name);
  private readonly LARGE_REPORT_THRESHOLD = 10000;
  private readonly BATCH_SIZE = 1000;
  private readonly MAX_RETRIES = 3;

  constructor(private readonly prisma: PrismaService) {}

  async processLargeTradeReport(reportId: string): Promise<void> {
    this.logger.log(`Starting large trade report processing for ${reportId}`);

    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
      include: { tradeRecords: true },
    });

    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    if (report.totalRecords <= this.LARGE_REPORT_THRESHOLD) {
      this.logger.log(`Report ${reportId} has ${report.totalRecords} records, using standard processing`);
      return;
    }

    this.logger.log(`Processing large report with ${report.totalRecords} records`);

    try {
      // Update status to processing
      await this.updateReportStatus(reportId, ReportStatus.PROCESSING);

      // Process in batches
      await this.processBatchedReport(reportId);

      // Update status to completed
      await this.updateReportStatus(reportId, ReportStatus.SUBMITTED);

      this.logger.log(`Large trade report processing completed for ${reportId}`);

    } catch (error) {
      this.logger.error(`Failed to process large trade report ${reportId}: ${error.message}`);
      
      // Update status to failed
      await this.updateReportStatus(reportId, ReportStatus.FAILED, error.message);
      
      throw error;
    }
  }

  private async processBatchedReport(reportId: string): Promise<void> {
    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
    });

    const totalBatches = Math.ceil(report.totalRecords / this.BATCH_SIZE);
    this.logger.log(`Processing ${totalBatches} batches for report ${reportId}`);

    for (let batchNumber = 1; batchNumber <= totalBatches; batchNumber++) {
      const offset = (batchNumber - 1) * this.BATCH_SIZE;
      
      try {
        await this.processBatch(reportId, batchNumber, offset);
        
        // Add delay to prevent overwhelming the system
        if (batchNumber < totalBatches) {
          await this.delay(100); // 100ms between batches
        }

      } catch (error) {
        this.logger.error(`Failed to process batch ${batchNumber} for report ${reportId}: ${error.message}`);
        
        // Retry logic
        await this.retryBatch(reportId, batchNumber, offset, error);
      }
    }
  }

  private async processBatch(reportId: string, batchNumber: number, offset: number): Promise<void> {
    this.logger.log(`Processing batch ${batchNumber} for report ${reportId}`);

    // Get batch records
    const batchRecords = await this.prisma.tradeReportRecord.findMany({
      where: { reportId },
      skip: offset,
      take: this.BATCH_SIZE,
    });

    if (batchRecords.length === 0) {
      this.logger.warn(`No records found in batch ${batchNumber} for report ${reportId}`);
      return;
    }

    // Validate batch records
    await this.validateBatchRecords(batchRecords);

    // Process each record in the batch
    const processedRecords = [];
    for (const record of batchRecords) {
      try {
        const processedRecord = await this.processTradeRecord(record);
        processedRecords.push(processedRecord);
      } catch (error) {
        this.logger.error(`Failed to process trade record ${record.id}: ${error.message}`);
        // Continue processing other records in the batch
      }
    }

    // Update batch progress
    await this.updateBatchProgress(reportId, batchNumber, processedRecords.length);

    this.logger.log(`Completed batch ${batchNumber}: ${processedRecords.length}/${batchRecords.length} records processed`);
  }

  private async validateBatchRecords(records: any[]): Promise<void> {
    const validationErrors = [];

    for (const record of records) {
      const errors = [];

      if (!record.transactionHash || record.transactionHash.trim() === '') {
        errors.push('Missing transaction hash');
      }

      if (!record.symbol || record.symbol.trim() === '') {
        errors.push('Missing symbol');
      }

      if (!record.quantity || parseFloat(record.quantity.toString()) <= 0) {
        errors.push('Invalid quantity');
      }

      if (!record.price || parseFloat(record.price.toString()) <= 0) {
        errors.push('Invalid price');
      }

      if (!record.buyerAddress || record.buyerAddress.trim() === '') {
        errors.push('Missing buyer address');
      }

      if (!record.sellerAddress || record.sellerAddress.trim() === '') {
        errors.push('Missing seller address');
      }

      if (errors.length > 0) {
        validationErrors.push({
          recordId: record.id,
          errors,
        });
      }
    }

    if (validationErrors.length > 0) {
      this.logger.warn(`Found ${validationErrors.length} validation errors in batch`);
      
      // Log validation errors
      for (const error of validationErrors) {
        this.logger.warn(`Record ${error.recordId} validation errors: ${error.errors.join(', ')}`);
      }
    }
  }

  private async processTradeRecord(record: any): Promise<any> {
    // Apply any necessary transformations
    const processedRecord = { ...record };

    // Format dates
    if (processedRecord.tradeDate) {
      processedRecord.tradeDate = new Date(processedRecord.tradeDate);
    }

    if (processedRecord.settlementDate) {
      processedRecord.settlementDate = new Date(processedRecord.settlementDate);
    }

    // Normalize addresses
    processedRecord.buyerAddress = processedRecord.buyerAddress.toUpperCase().trim();
    processedRecord.sellerAddress = processedRecord.sellerAddress.toUpperCase().trim();

    // Calculate derived fields
    processedRecord.processedAt = new Date();
    processedRecord.processingVersion = '1.0';

    return processedRecord;
  }

  private async retryBatch(reportId: string, batchNumber: number, offset: number, originalError: Error): Promise<void> {
    this.logger.log(`Retrying batch ${batchNumber} for report ${reportId}`);

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        this.logger.log(`Retry attempt ${attempt}/${this.MAX_RETRIES} for batch ${batchNumber}`);
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await this.delay(delay);
        
        await this.processBatch(reportId, batchNumber, offset);
        
        this.logger.log(`Batch ${batchNumber} succeeded on retry attempt ${attempt}`);
        return;
        
      } catch (error) {
        this.logger.error(`Retry attempt ${attempt} failed for batch ${batchNumber}: ${error.message}`);
        
        if (attempt === this.MAX_RETRIES) {
          throw new Error(`Batch ${batchNumber} failed after ${this.MAX_RETRIES} attempts: ${error.message}`);
        }
      }
    }
  }

  private async updateBatchProgress(reportId: string, batchNumber: number, processedCount: number): Promise<void> {
    // Update report metadata with batch progress
    await this.prisma.regulatoryReport.update({
      where: { id: reportId },
      data: {
        metadata: {
          batchProcessing: {
            currentBatch: batchNumber,
            lastProcessedCount: processedCount,
            lastProcessedAt: new Date(),
          },
        },
      },
    });
  }

  private async updateReportStatus(reportId: string, status: ReportStatus, errorMessage?: string): Promise<void> {
    await this.prisma.regulatoryReport.update({
      where: { id: reportId },
      data: {
        status,
        ...(errorMessage && { errorMessage }),
      },
    });

    // Log the status change
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.REPORT,
        entityId: reportId,
        action: RegulatoryAction.UPDATE,
        performedBy: 'system',
        previousState: { status: ReportStatus.PENDING },
        newState: { status },
        reason: errorMessage || `Large report processing: ${status}`,
      },
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getLargeReportStatistics(): Promise<any> {
    const largeReports = await this.prisma.regulatoryReport.findMany({
      where: {
        totalRecords: { gt: this.LARGE_REPORT_THRESHOLD },
      },
    });

    const statistics = {
      totalLargeReports: largeReports.length,
      byStatus: {
        pending: largeReports.filter(r => r.status === ReportStatus.PENDING).length,
        processing: largeReports.filter(r => r.status === ReportStatus.PROCESSING).length,
        submitted: largeReports.filter(r => r.status === ReportStatus.SUBMITTED).length,
        failed: largeReports.filter(r => r.status === ReportStatus.FAILED).length,
      },
      averageRecordCount: largeReports.length > 0 
        ? largeReports.reduce((sum, r) => sum + r.totalRecords, 0) / largeReports.length 
        : 0,
      largestReport: largeReports.length > 0 
        ? largeReports.reduce((max, r) => r.totalRecords > max.totalRecords ? r : max)
        : null,
    };

    return statistics;
  }

  async optimizeLargeReportProcessing(reportId: string): Promise<void> {
    this.logger.log(`Optimizing large report processing for ${reportId}`);

    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
      include: { tradeRecords: true },
    });

    if (!report || report.totalRecords <= this.LARGE_REPORT_THRESHOLD) {
      return;
    }

    // Analyze report characteristics for optimization
    const characteristics = await this.analyzeReportCharacteristics(report);

    // Apply optimizations based on characteristics
    if (characteristics.hasHighVolumeSymbols) {
      this.logger.log('Applying symbol-based grouping optimization');
      await this.processBySymbolGrouping(reportId);
    }

    if (characteristics.hasTimeBasedPatterns) {
      this.logger.log('Applying time-based processing optimization');
      await this.processByTimeWindows(reportId);
    }

    if (characteristics.hasAddressConcentration) {
      this.logger.log('Applying address-based processing optimization');
      await this.processByAddressGrouping(reportId);
    }
  }

  private async analyzeReportCharacteristics(report: any): Promise<any> {
    const tradeRecords = report.tradeRecords;

    // Analyze symbol distribution
    const symbolCounts = tradeRecords.reduce((acc, trade) => {
      acc[trade.symbol] = (acc[trade.symbol] || 0) + 1;
      return acc;
    }, {});

    const hasHighVolumeSymbols = Object.values(symbolCounts).some(count => count > 1000);

    // Analyze time patterns
    const timeDistribution = tradeRecords.reduce((acc, trade) => {
      const hour = new Date(trade.tradeDate).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});

    const hasTimeBasedPatterns = Object.values(timeDistribution).some(count => count > 500);

    // Analyze address concentration
    const addressCounts = tradeRecords.reduce((acc, trade) => {
      acc[trade.buyerAddress] = (acc[trade.buyerAddress] || 0) + 1;
      acc[trade.sellerAddress] = (acc[trade.sellerAddress] || 0) + 1;
      return acc;
    }, {});

    const hasAddressConcentration = Object.values(addressCounts).some(count => count > 100);

    return {
      hasHighVolumeSymbols,
      hasTimeBasedPatterns,
      hasAddressConcentration,
      totalRecords: tradeRecords.length,
      uniqueSymbols: Object.keys(symbolCounts).length,
      uniqueAddresses: Object.keys(addressCounts).length,
    };
  }

  private async processBySymbolGrouping(reportId: string): Promise<void> {
    this.logger.log(`Processing report ${reportId} by symbol grouping`);

    // Get all unique symbols
    const symbols = await this.prisma.tradeReportRecord.findMany({
      where: { reportId },
      select: { symbol: true },
      distinct: ['symbol'],
    });

    for (const { symbol } of symbols) {
      const symbolRecords = await this.prisma.tradeReportRecord.findMany({
        where: { reportId, symbol },
      });

      // Process symbol-specific batch
      await this.processSymbolBatch(reportId, symbol, symbolRecords);
    }
  }

  private async processSymbolBatch(reportId: string, symbol: string, records: any[]): Promise<void> {
    this.logger.log(`Processing ${records.length} records for symbol ${symbol}`);

    // Apply symbol-specific optimizations
    for (const record of records) {
      // Symbol-specific processing logic
      record.symbolGroup = symbol;
      record.processedAt = new Date();
    }

    // Update records in batch
    await Promise.all(
      records.map(record => 
        this.prisma.tradeReportRecord.update({
          where: { id: record.id },
          data: { 
            // Update any processed fields
          },
        })
      )
    );
  }

  private async processByTimeWindows(reportId: string): Promise<void> {
    this.logger.log(`Processing report ${reportId} by time windows`);

    // Get time range
    const timeRange = await this.prisma.tradeReportRecord.aggregate({
      where: { reportId },
      _min: { tradeDate: true },
      _max: { tradeDate: true },
    });

    const startTime = new Date(timeRange._min.tradeDate);
    const endTime = new Date(timeRange._max.tradeDate);
    const windowSize = 60 * 60 * 1000; // 1 hour windows

    for (let windowStart = startTime; windowStart < endTime; windowStart = new Date(windowStart.getTime() + windowSize)) {
      const windowEnd = new Date(windowStart.getTime() + windowSize);

      const windowRecords = await this.prisma.tradeReportRecord.findMany({
        where: {
          reportId,
          tradeDate: {
            gte: windowStart,
            lt: windowEnd,
          },
        },
      });

      if (windowRecords.length > 0) {
        await this.processTimeWindow(reportId, windowStart, windowEnd, windowRecords);
      }
    }
  }

  private async processTimeWindow(reportId: string, windowStart: Date, windowEnd: Date, records: any[]): Promise<void> {
    this.logger.log(`Processing ${records.length} records for time window ${windowStart} - ${windowEnd}`);

    // Apply time-window specific processing
    for (const record of records) {
      record.timeWindow = `${windowStart.toISOString()}_${windowEnd.toISOString()}`;
      record.processedAt = new Date();
    }
  }

  private async processByAddressGrouping(reportId: string): Promise<void> {
    this.logger.log(`Processing report ${reportId} by address grouping`);

    // Get high-frequency addresses
    const addressCounts = await this.prisma.$queryRaw`
      SELECT 
        unnest(array[buyer_address, seller_address]) as address,
        COUNT(*) as count
      FROM trade_report_records 
      WHERE report_id = ${reportId}
      GROUP BY address
      HAVING COUNT(*) > 100
    `;

    for (const { address } of addressCounts) {
      const addressRecords = await this.prisma.tradeReportRecord.findMany({
        where: {
          reportId,
          OR: [
            { buyerAddress: address },
            { sellerAddress: address },
          ],
        },
      });

      await this.processAddressBatch(reportId, address, addressRecords);
    }
  }

  private async processAddressBatch(reportId: string, address: string, records: any[]): Promise<void> {
    this.logger.log(`Processing ${records.length} records for address ${address}`);

    // Apply address-specific processing
    for (const record of records) {
      record.addressGroup = address;
      record.processedAt = new Date();
    }
  }
}
