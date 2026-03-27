import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RegulatoryReportingService } from '../regulatory-reporting.service';
import { 
  RegulatoryReportType, 
  ReportStatus, 
  ReportFormat,
  RegulatoryAction,
  RegulatoryEntityType 
} from '@prisma/client';
import { CreateTradeReportDto, TradeReportRecordDto, FinraReportFormatDto } from '../dto';

@Injectable()
export class TradeReportingService {
  private readonly logger = new Logger(TradeReportingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly regulatoryReportingService: RegulatoryReportingService,
  ) {}

  async createTradeReport(createTradeReportDto: CreateTradeReportDto) {
    this.logger.log(`Creating trade report with ${createTradeReportDto.trades.length} records`);

    const report = await this.regulatoryReportingService.createReport(
      RegulatoryReportType.TRADE_REPORTING,
      'FINRA', // Default jurisdiction
      {
        start: new Date(Math.min(...createTradeReportDto.trades.map(t => new Date(t.tradeDate).getTime()))),
        end: new Date(Math.max(...createTradeReportDto.trades.map(t => new Date(t.tradeDate).getTime()))),
      },
      ReportFormat.XML,
    );

    const tradeRecords = await Promise.all(
      createTradeReportDto.trades.map(trade => 
        this.prisma.tradeReportRecord.create({
          data: {
            reportId: report.id,
            transactionHash: trade.transactionHash,
            tradeDate: trade.tradeDate,
            symbol: trade.symbol,
            quantity: trade.quantity,
            price: trade.price,
            totalValue: trade.totalValue,
            buyerAddress: trade.buyerAddress,
            sellerAddress: trade.sellerAddress,
            venue: trade.venue,
            settlementDate: trade.settlementDate,
            reportableEntity: trade.reportableEntity,
          },
        })
      )
    );

    // Update report with total records
    await this.prisma.regulatoryReport.update({
      where: { id: report.id },
      data: { totalRecords: tradeRecords.length },
    });

    this.logger.log(`Trade report created with ID: ${report.id}`);
    return { report, tradeRecords };
  }

  async generateFINRAReport(reportId: string): Promise<FinraReportFormatDto> {
    this.logger.log(`Generating FINRA report for report ID: ${reportId}`);

    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
      include: { tradeRecords: true },
    });

    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    if (report.reportType !== RegulatoryReportType.TRADE_REPORTING) {
      throw new Error(`Report ${reportId} is not a trade report`);
    }

    // Convert to FINRA format
    const finraReport = this.convertToFINRAFormat(report);

    // Update report status
    await this.regulatoryReportingService.updateReportStatus(
      reportId,
      ReportStatus.PROCESSING,
      'FINRA report generation in progress',
    );

    return finraReport;
  }

  async processLargeTradeReport(reportId: string): Promise<void> {
    this.logger.log(`Processing large trade report: ${reportId}`);

    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
      include: { tradeRecords: true },
    });

    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    // Check if this is a large report (>10k records)
    if (report.totalRecords <= 10000) {
      this.logger.log(`Report ${reportId} has ${report.totalRecords} records, using standard processing`);
      return;
    }

    this.logger.log(`Processing large report with ${report.totalRecords} records`);

    // Process in batches for large reports
    const batchSize = 1000;
    const batches = Math.ceil(report.totalRecords / batchSize);

    for (let i = 0; i < batches; i++) {
      const offset = i * batchSize;
      const batch = await this.prisma.tradeReportRecord.findMany({
        where: { reportId },
        skip: offset,
        take: batchSize,
      });

      // Process batch
      await this.processBatch(reportId, batch, i + 1, batches);

      // Add delay to prevent overwhelming the system
      if (i < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    this.logger.log(`Completed processing large report: ${reportId}`);
  }

  async submitToFINRA(reportId: string): Promise<{ submissionId: string; status: string }> {
    this.logger.log(`Submitting report ${reportId} to FINRA`);

    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    if (report.status !== ReportStatus.PROCESSING) {
      throw new Error(`Report ${reportId} is not ready for submission`);
    }

    // Generate FINRA XML
    const finraXml = await this.generateFINRA_XML(reportId);

    // Submit to FINRA API (mock implementation)
    const submissionId = await this.submitToFINRA_API(finraXml);

    // Update report status
    await this.regulatoryReportingService.updateReportStatus(
      reportId,
      ReportStatus.SUBMITTED,
      `Submitted to FINRA with submission ID: ${submissionId}`,
    );

    return { submissionId, status: 'SUBMITTED' };
  }

  private convertToFINRAFormat(report: any): FinraReportFormatDto {
    const header = {
      submittingFirm: 'STELLAR SECURITIES',
      contactInfo: {
        name: 'Compliance Officer',
        phone: '555-0123',
        email: 'compliance@stellar.com',
      },
      submissionType: 'EQUITY_TRADES',
      submissionDate: new Date().toISOString(),
      reportPeriod: report.reportPeriod,
    };

    const trades = report.tradeRecords.map(trade => ({
      transactionId: trade.transactionHash,
      tradeDate: trade.tradeDate,
      symbol: trade.symbol,
      quantity: trade.quantity.toString(),
      price: trade.price.toString(),
      totalValue: trade.totalValue.toString(),
      buyerAddress: trade.buyerAddress,
      sellerAddress: trade.sellerAddress,
      venue: trade.venue,
      settlementDate: trade.settlementDate,
      reportableEntity: trade.reportableEntity,
    }));

    const summary = {
      totalTrades: trades.length,
      totalVolume: trades.reduce((sum, trade) => sum + parseFloat(trade.totalValue), 0),
      reportingPeriod: report.reportPeriod,
      submissionTimestamp: new Date().toISOString(),
    };

    return { header, trades, summary };
  }

  private async generateFINRA_XML(reportId: string): Promise<string> {
    const report = await this.prisma.regulatoryReport.findUnique({
      where: { id: reportId },
      include: { tradeRecords: true },
    });

    const finraData = this.convertToFINRAFormat(report);

    // Generate XML (simplified implementation)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FINRA_Submission>
  <Header>
    <SubmittingFirm>${finraData.header.submittingFirm}</SubmittingFirm>
    <ContactInfo>
      <Name>${finraData.header.contactInfo.name}</Name>
      <Phone>${finraData.header.contactInfo.phone}</Phone>
      <Email>${finraData.header.contactInfo.email}</Email>
    </ContactInfo>
    <SubmissionType>${finraData.header.submissionType}</SubmissionType>
    <SubmissionDate>${finraData.header.submissionDate}</SubmissionDate>
    <ReportPeriod>
      <Start>${finraData.header.reportPeriod.start}</Start>
      <End>${finraData.header.reportPeriod.end}</End>
    </ReportPeriod>
  </Header>
  <Trades>
    ${finraData.trades.map(trade => `
    <Trade>
      <TransactionId>${trade.transactionId}</TransactionId>
      <TradeDate>${trade.tradeDate}</TradeDate>
      <Symbol>${trade.symbol}</Symbol>
      <Quantity>${trade.quantity}</Quantity>
      <Price>${trade.price}</Price>
      <TotalValue>${trade.totalValue}</TotalValue>
      <BuyerAddress>${trade.buyerAddress}</BuyerAddress>
      <SellerAddress>${trade.sellerAddress}</SellerAddress>
      <Venue>${trade.venue}</Venue>
      <SettlementDate>${trade.settlementDate}</SettlementDate>
      <ReportableEntity>${trade.reportableEntity}</ReportableEntity>
    </Trade>`).join('')}
  </Trades>
  <Summary>
    <TotalTrades>${finraData.summary.totalTrades}</TotalTrades>
    <TotalVolume>${finraData.summary.totalVolume}</TotalVolume>
    <ReportingPeriod>${finraData.summary.reportingPeriod}</ReportingPeriod>
    <SubmissionTimestamp>${finraData.summary.submissionTimestamp}</SubmissionTimestamp>
  </Summary>
</FINRA_Submission>`;

    return xml;
  }

  private async submitToFINRA_API(xmlData: string): Promise<string> {
    // Mock FINRA API submission
    // In production, this would integrate with actual FINRA submission endpoints
    const submissionId = `FINRA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`Mock submission to FINRA API with ID: ${submissionId}`);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return submissionId;
  }

  private async processBatch(reportId: string, batch: any[], batchNumber: number, totalBatches: number): Promise<void> {
    this.logger.log(`Processing batch ${batchNumber}/${totalBatches} for report ${reportId}`);
    
    // Process each trade record in the batch
    for (const trade of batch) {
      // Validate trade data
      this.validateTradeRecord(trade);
      
      // Apply any necessary transformations
      await this.transformTradeRecord(trade);
    }
    
    this.logger.log(`Completed batch ${batchNumber}/${totalBatches}`);
  }

  private validateTradeRecord(trade: any): void {
    if (!trade.transactionHash || trade.transactionHash.trim() === '') {
      throw new Error(`Invalid transaction hash for trade record`);
    }
    
    if (!trade.symbol || trade.symbol.trim() === '') {
      throw new Error(`Invalid symbol for trade record`);
    }
    
    if (trade.quantity <= 0) {
      throw new Error(`Invalid quantity for trade record`);
    }
    
    if (trade.price <= 0) {
      throw new Error(`Invalid price for trade record`);
    }
  }

  private async transformTradeRecord(trade: any): Promise<void> {
    // Apply any necessary data transformations
    // For example, format dates, normalize addresses, etc.
    
    if (trade.tradeDate) {
      trade.tradeDate = new Date(trade.tradeDate);
    }
    
    if (trade.settlementDate) {
      trade.settlementDate = new Date(trade.settlementDate);
    }
  }

  async getTradeReportsByDateRange(startDate: Date, endDate: Date) {
    return this.prisma.tradeReportRecord.findMany({
      where: {
        tradeDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        report: true,
      },
      orderBy: {
        tradeDate: 'desc',
      },
    });
  }

  async getTradeReportsBySymbol(symbol: string) {
    return this.prisma.tradeReportRecord.findMany({
      where: {
        symbol: symbol.toUpperCase(),
      },
      include: {
        report: true,
      },
      orderBy: {
        tradeDate: 'desc',
      },
    });
  }

  async getTradeReportsByAddress(address: string) {
    return this.prisma.tradeReportRecord.findMany({
      where: {
        OR: [
          { buyerAddress: address },
          { sellerAddress: address },
        ],
      },
      include: {
        report: true,
      },
      orderBy: {
        tradeDate: 'desc',
      },
    });
  }
}
