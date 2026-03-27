import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { 
  RegulatoryReportType, 
  ReportFormat,
  ReportStatus 
} from '@prisma/client';

@Injectable()
export class ReportGenerationService {
  private readonly logger = new Logger(ReportGenerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateReport(reportId: string, format?: ReportFormat): Promise<any> {
    this.logger.log(`Generating report ${reportId} in format ${format || 'default'}`);

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

    const targetFormat = format || report.format;

    switch (report.reportType) {
      case RegulatoryReportType.TRADE_REPORTING:
        return this.generateTradeReport(report, targetFormat);
      
      case RegulatoryReportType.SUSPICIOUS_ACTIVITY:
        return this.generateSARReport(report, targetFormat);
      
      case RegulatoryReportType.COMPLIANCE_CERTIFICATION:
      case RegulatoryReportType.QUARTERLY_FILING:
        return this.generateComplianceReport(report, targetFormat);
      
      case RegulatoryReportType.ANNUAL_REPORT:
        return this.generateAnnualReport(report, targetFormat);
      
      case RegulatoryReportType.AD_HOC_REPORT:
        return this.generateAdHocReport(report, targetFormat);
      
      default:
        throw new Error(`Unsupported report type: ${report.reportType}`);
    }
  }

  private async generateTradeReport(report: any, format: ReportFormat): Promise<any> {
    const tradeRecords = report.tradeRecords;

    switch (format) {
      case ReportFormat.XML:
        return this.generateTradeReportXML(report, tradeRecords);
      
      case ReportFormat.JSON:
        return this.generateTradeReportJSON(report, tradeRecords);
      
      case ReportFormat.CSV:
        return this.generateTradeReportCSV(report, tradeRecords);
      
      case ReportFormat.PDF:
        return this.generateTradeReportPDF(report, tradeRecords);
      
      default:
        throw new Error(`Unsupported format for trade report: ${format}`);
    }
  }

  private async generateSARReport(report: any, format: ReportFormat): Promise<any> {
    const sarRecords = report.sarRecords;

    switch (format) {
      case ReportFormat.PDF:
        return this.generateSARReportPDF(report, sarRecords);
      
      case ReportFormat.JSON:
        return this.generateSARReportJSON(report, sarRecords);
      
      case ReportFormat.XML:
        return this.generateSARReportXML(report, sarRecords);
      
      default:
        throw new Error(`Unsupported format for SAR report: ${format}`);
    }
  }

  private async generateComplianceReport(report: any, format: ReportFormat): Promise<any> {
    const complianceItems = report.complianceItems;

    switch (format) {
      case ReportFormat.PDF:
        return this.generateComplianceReportPDF(report, complianceItems);
      
      case ReportFormat.JSON:
        return this.generateComplianceReportJSON(report, complianceItems);
      
      case ReportFormat.XML:
        return this.generateComplianceReportXML(report, complianceItems);
      
      default:
        throw new Error(`Unsupported format for compliance report: ${format}`);
    }
  }

  private async generateAnnualReport(report: any, format: ReportFormat): Promise<any> {
    // Annual reports typically include all types of activities
    const allData = {
      tradeRecords: report.tradeRecords,
      sarRecords: report.sarRecords,
      complianceItems: report.complianceItems,
    };

    switch (format) {
      case ReportFormat.PDF:
        return this.generateAnnualReportPDF(report, allData);
      
      case ReportFormat.JSON:
        return this.generateAnnualReportJSON(report, allData);
      
      default:
        throw new Error(`Unsupported format for annual report: ${format}`);
    }
  }

  private async generateAdHocReport(report: any, format: ReportFormat): Promise<any> {
    // Ad-hoc reports can include any combination of data
    const data = {
      tradeRecords: report.tradeRecords,
      sarRecords: report.sarRecords,
      complianceItems: report.complianceItems,
      metadata: report.metadata,
    };

    switch (format) {
      case ReportFormat.PDF:
        return this.generateAdHocReportPDF(report, data);
      
      case ReportFormat.JSON:
        return this.generateAdHocReportJSON(report, data);
      
      case ReportFormat.CSV:
        return this.generateAdHocReportCSV(report, data);
      
      default:
        throw new Error(`Unsupported format for ad-hoc report: ${format}`);
    }
  }

  // Trade Report Generators
  private generateTradeReportXML(report: any, tradeRecords: any[]): string {
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<TradeReport>
  <Header>
    <ReportID>${report.id}</ReportID>
    <ReportType>${report.reportType}</ReportType>
    <Jurisdiction>${report.jurisdiction}</Jurisdiction>
    <ReportPeriod>
      <Start>${report.reportPeriod.start}</Start>
      <End>${report.reportPeriod.end}</End>
    </ReportPeriod>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <TotalRecords>${tradeRecords.length}</TotalRecords>
  </Header>`;

    const trades = tradeRecords.map(trade => `
  <Trade>
    <TransactionHash>${trade.transactionHash}</TransactionHash>
    <TradeDate>${trade.tradeDate}</TradeDate>
    <Symbol>${trade.symbol}</Symbol>
    <Quantity>${trade.quantity}</Quantity>
    <Price>${trade.price}</Price>
    <TotalValue>${trade.totalValue}</TotalValue>
    <BuyerAddress>${trade.buyerAddress}</BuyerAddress>
    <SellerAddress>${trade.sellerAddress}</SellerAddress>
    <Venue>${trade.venue}</Venue>
    <SettlementDate>${trade.settlementDate || ''}</SettlementDate>
    <ReportableEntity>${trade.reportableEntity}</ReportableEntity>
  </Trade>`).join('');

    const summary = `
  <Summary>
    <TotalTrades>${tradeRecords.length}</TotalTrades>
    <TotalVolume>${tradeRecords.reduce((sum, t) => sum + parseFloat(t.totalValue.toString()), 0)}</TotalVolume>
    <UniqueSymbols>${[...new Set(tradeRecords.map(t => t.symbol))].length}</UniqueSymbols>
    <UniqueAddresses>${[...new Set(tradeRecords.flatMap(t => [t.buyerAddress, t.sellerAddress]))].length}</UniqueAddresses>
  </Summary>
</TradeReport>`;

    return header + trades + summary;
  }

  private generateTradeReportJSON(report: any, tradeRecords: any[]): object {
    return {
      report: {
        id: report.id,
        type: report.reportType,
        jurisdiction: report.jurisdiction,
        reportPeriod: report.reportPeriod,
        generatedAt: new Date().toISOString(),
        totalRecords: tradeRecords.length,
      },
      trades: tradeRecords.map(trade => ({
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
      })),
      summary: {
        totalTrades: tradeRecords.length,
        totalVolume: tradeRecords.reduce((sum, t) => sum + parseFloat(t.totalValue.toString()), 0),
        uniqueSymbols: [...new Set(tradeRecords.map(t => t.symbol))].length,
        uniqueAddresses: [...new Set(tradeRecords.flatMap(t => [t.buyerAddress, t.sellerAddress]))].length,
      },
    };
  }

  private generateTradeReportCSV(report: any, tradeRecords: any[]): string {
    const headers = [
      'TransactionHash',
      'TradeDate',
      'Symbol',
      'Quantity',
      'Price',
      'TotalValue',
      'BuyerAddress',
      'SellerAddress',
      'Venue',
      'SettlementDate',
      'ReportableEntity',
    ].join(',');

    const rows = tradeRecords.map(trade => [
      trade.transactionHash,
      trade.tradeDate,
      trade.symbol,
      trade.quantity,
      trade.price,
      trade.totalValue,
      trade.buyerAddress,
      trade.sellerAddress,
      trade.venue,
      trade.settlementDate || '',
      trade.reportableEntity,
    ].map(field => `"${field}"`).join(','));

    return [headers, ...rows].join('\n');
  }

  private generateTradeReportPDF(report: any, tradeRecords: any[]): Buffer {
    // Mock PDF generation - in production would use a PDF library like Puppeteer
    const pdfContent = `
Trade Report - ${report.id}
Generated: ${new Date().toISOString()}
Jurisdiction: ${report.jurisdiction}
Period: ${report.reportPeriod.start} to ${report.reportPeriod.end}

Total Trades: ${tradeRecords.length}
Total Volume: $${tradeRecords.reduce((sum, t) => sum + parseFloat(t.totalValue.toString()), 0).toLocaleString()}

Trade Details:
${tradeRecords.map(trade => `
- ${trade.transactionHash}
  Date: ${trade.tradeDate}
  Symbol: ${trade.symbol}
  Quantity: ${trade.quantity}
  Price: $${trade.price}
  Value: $${trade.totalValue}
  Buyer: ${trade.buyerAddress}
  Seller: ${trade.sellerAddress}
  Venue: ${trade.venue}
`).join('\n')}
    `.trim();

    return Buffer.from(pdfContent, 'utf8');
  }

  // SAR Report Generators
  private generateSARReportPDF(report: any, sarRecords: any[]): Buffer {
    const content = sarRecords.map(sar => `
Suspicious Activity Report
SAR ID: ${sar.sarId}
Filing Date: ${sar.filingDate}
Activity Type: ${sar.activityType}
Priority: ${sar.priority}
Confidence: ${sar.confidence}

Suspicious Amount: $${sar.suspiciousAmount}
Involved Addresses: ${sar.involvedAddresses.join(', ')}
Timeframe: ${sar.timeframe.start} to ${sar.timeframe.end}

Narrative:
${sar.narrative}

Investigation ID: ${sar.investigationId || 'N/A'}
---
    `).join('\n');

    return Buffer.from(content, 'utf8');
  }

  private generateSARReportJSON(report: any, sarRecords: any[]): object {
    return {
      report: {
        id: report.id,
        type: report.reportType,
        generatedAt: new Date().toISOString(),
      },
      suspiciousActivityReports: sarRecords.map(sar => ({
        sarId: sar.sarId,
        filingDate: sar.filingDate,
        suspiciousAmount: sar.suspiciousAmount,
        activityType: sar.activityType,
        involvedAddresses: sar.involvedAddresses,
        timeframe: sar.timeframe,
        narrative: sar.narrative,
        confidence: sar.confidence,
        investigationId: sar.investigationId,
        priority: sar.priority,
        status: sar.status,
      })),
    };
  }

  private generateSARReportXML(report: any, sarRecords: any[]): string {
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<SARReport>
  <Header>
    <ReportID>${report.id}</ReportID>
    <ReportType>${report.reportType}</ReportType>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <TotalSARs>${sarRecords.length}</TotalSARs>
  </Header>`;

    const sars = sarRecords.map(sar => `
  <SuspiciousActivityReport>
    <SARID>${sar.sarId}</SARID>
    <FilingDate>${sar.filingDate}</FilingDate>
    <SuspiciousAmount>${sar.suspiciousAmount}</SuspiciousAmount>
    <ActivityType>${sar.activityType}</ActivityType>
    <InvolvedAddresses>
      ${sar.involvedAddresses.map(addr => `<Address>${addr}</Address>`).join('\n      ')}
    </InvolvedAddresses>
    <Timeframe>
      <Start>${sar.timeframe.start}</Start>
      <End>${sar.timeframe.end}</End>
    </Timeframe>
    <Narrative><![CDATA[${sar.narrative}]]></Narrative>
    <Confidence>${sar.confidence}</Confidence>
    <InvestigationID>${sar.investigationId || ''}</InvestigationID>
    <Priority>${sar.priority}</Priority>
    <Status>${sar.status}</Status>
  </SuspiciousActivityReport>`).join('');

    return header + sars + '\n</SARReport>';
  }

  // Compliance Report Generators
  private generateComplianceReportPDF(report: any, complianceItems: any[]): Buffer {
    const content = complianceItems.map(item => `
Compliance Certification Report
Report ID: ${report.id}
Certification Type: ${item.certificationType}
Period: ${item.period.start} to ${item.period.end}
Certified By: ${item.certifiedBy}
Certification Date: ${item.certificationDate}
Status: ${item.status}

Findings:
${JSON.stringify(item.findings, null, 2)}

Recommendations:
${JSON.stringify(item.recommendations, null, 2)}

Approved By: ${item.approvedBy || 'N/A'}
Approved At: ${item.approvedAt || 'N/A'}
---
    `).join('\n');

    return Buffer.from(content, 'utf8');
  }

  private generateComplianceReportJSON(report: any, complianceItems: any[]): object {
    return {
      report: {
        id: report.id,
        type: report.reportType,
        generatedAt: new Date().toISOString(),
      },
      complianceItems: complianceItems.map(item => ({
        certificationType: item.certificationType,
        period: item.period,
        certifiedBy: item.certifiedBy,
        certificationDate: item.certificationDate,
        status: item.status,
        findings: item.findings,
        recommendations: item.recommendations,
        approvedBy: item.approvedBy,
        approvedAt: item.approvedAt,
      })),
    };
  }

  private generateComplianceReportXML(report: any, complianceItems: any[]): string {
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<ComplianceReport>
  <Header>
    <ReportID>${report.id}</ReportID>
    <ReportType>${report.reportType}</ReportType>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <TotalItems>${complianceItems.length}</TotalItems>
  </Header>`;

    const items = complianceItems.map(item => `
  <ComplianceItem>
    <CertificationType>${item.certificationType}</CertificationType>
    <Period>
      <Start>${item.period.start}</Start>
      <End>${item.period.end}</End>
    </Period>
    <CertifiedBy>${item.certifiedBy}</CertifiedBy>
    <CertificationDate>${item.certificationDate}</CertificationDate>
    <Status>${item.status}</Status>
    <Findings><![CDATA[${JSON.stringify(item.findings)}]]></Findings>
    <Recommendations><![CDATA[${JSON.stringify(item.recommendations)}]]></Recommendations>
    <ApprovedBy>${item.approvedBy || ''}</ApprovedBy>
    <ApprovedAt>${item.approvedAt || ''}</ApprovedAt>
  </ComplianceItem>`).join('');

    return header + items + '\n</ComplianceReport>';
  }

  // Annual Report Generators
  private generateAnnualReportPDF(report: any, allData: any): Buffer {
    const content = `
Annual Regulatory Report
Report ID: ${report.id}
Period: ${report.reportPeriod.start} to ${report.reportPeriod.end}

Trade Activity Summary:
- Total Trades: ${allData.tradeRecords.length}
- Total Volume: $${allData.tradeRecords.reduce((sum, t) => sum + parseFloat(t.totalValue.toString()), 0).toLocaleString()}

Suspicious Activity Summary:
- Total SARs: ${allData.sarRecords.length}
- High Priority SARs: ${allData.sarRecords.filter(s => s.priority === 'HIGH').length}

Compliance Summary:
- Total Certifications: ${allData.complianceItems.length}
- Certified Items: ${allData.complianceItems.filter(c => c.status === 'CERTIFIED').length}

Generated: ${new Date().toISOString()}
    `.trim();

    return Buffer.from(content, 'utf8');
  }

  private generateAnnualReportJSON(report: any, allData: any): object {
    return {
      report: {
        id: report.id,
        type: report.reportType,
        period: report.reportPeriod,
        generatedAt: new Date().toISOString(),
      },
      summary: {
        trades: {
          total: allData.tradeRecords.length,
          volume: allData.tradeRecords.reduce((sum, t) => sum + parseFloat(t.totalValue.toString()), 0),
        },
        suspiciousActivity: {
          total: allData.sarRecords.length,
          highPriority: allData.sarRecords.filter(s => s.priority === 'HIGH').length,
        },
        compliance: {
          total: allData.complianceItems.length,
          certified: allData.complianceItems.filter(c => c.status === 'CERTIFIED').length,
        },
      },
      detailedData: allData,
    };
  }

  // Ad-Hoc Report Generators
  private generateAdHocReportPDF(report: any, data: any): Buffer {
    const content = `
Ad-Hoc Regulatory Report
Report ID: ${report.id}
Generated: ${new Date().toISOString()}

Custom Report Data:
${JSON.stringify(data, null, 2)}
    `.trim();

    return Buffer.from(content, 'utf8');
  }

  private generateAdHocReportJSON(report: any, data: any): object {
    return {
      report: {
        id: report.id,
        type: report.reportType,
        generatedAt: new Date().toISOString(),
        metadata: report.metadata,
      },
      data,
    };
  }

  private generateAdHocReportCSV(report: any, data: any): string {
    // Simple CSV export for ad-hoc reports
    const headers = 'ReportID,Type,GeneratedAt,DataSummary';
    const row = [
      report.id,
      report.reportType,
      new Date().toISOString(),
      JSON.stringify(data).substring(0, 100) + '...',
    ].map(field => `"${field}"`).join(',');

    return [headers, row].join('\n');
  }

  async validateReportFormat(reportId: string, format: ReportFormat): Promise<boolean> {
    try {
      await this.generateReport(reportId, format);
      return true;
    } catch (error) {
      this.logger.error(`Report format validation failed: ${error.message}`);
      return false;
    }
  }

  async getSupportedFormats(reportType: RegulatoryReportType): Promise<ReportFormat[]> {
    const formatMap: Record<RegulatoryReportType, ReportFormat[]> = {
      [RegulatoryReportType.TRADE_REPORTING]: [
        ReportFormat.XML,
        ReportFormat.JSON,
        ReportFormat.CSV,
        ReportFormat.PDF,
      ],
      [RegulatoryReportType.SUSPICIOUS_ACTIVITY]: [
        ReportFormat.PDF,
        ReportFormat.JSON,
        ReportFormat.XML,
      ],
      [RegulatoryReportType.COMPLIANCE_CERTIFICATION]: [
        ReportFormat.PDF,
        ReportFormat.JSON,
        ReportFormat.XML,
      ],
      [RegulatoryReportType.QUARTERLY_FILING]: [
        ReportFormat.PDF,
        ReportFormat.JSON,
        ReportFormat.XML,
      ],
      [RegulatoryReportType.ANNUAL_REPORT]: [
        ReportFormat.PDF,
        ReportFormat.JSON,
      ],
      [RegulatoryReportType.AD_HOC_REPORT]: [
        ReportFormat.PDF,
        ReportFormat.JSON,
        ReportFormat.CSV,
      ],
    };

    return formatMap[reportType] || [];
  }
}
