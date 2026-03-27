import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

// Controllers
import { RegulatoryReportingController } from './regulatory-reporting.controller';
import { TradeReportingController } from './controllers/trade-reporting.controller';
import { SARController } from './controllers/sar.controller';
import { ComplianceController } from './controllers/compliance.controller';
import { ExaminerController } from './controllers/examiner.controller';

// Services
import { RegulatoryReportingService } from './regulatory-reporting.service';
import { TradeReportingService } from './services/trade-reporting.service';
import { SARService } from './services/sar.service';
import { ComplianceService } from './services/compliance.service';
import { ExaminerService } from './services/examiner.service';
import { ReportGenerationService } from './services/report-generation.service';
import { SuspiciousPatternDetectionService } from './services/suspicious-pattern-detection.service';
import { ReportRetentionService } from './services/report-retention.service';
import { EncryptionAndIntegrityService } from './services/encryption-and-integrity.service';

// Processors (for large report processing)
import { LargeTradeReportProcessor } from './processors/large-trade-report.processor';
import { SARBatchProcessor } from './processors/sar-batch.processor';

// DTOs
import * as DTOs from './dto';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    EncryptionModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [
    RegulatoryReportingController,
    TradeReportingController,
    SARController,
    ComplianceController,
    ExaminerController,
  ],
  providers: [
    RegulatoryReportingService,
    TradeReportingService,
    SARService,
    ComplianceService,
    ExaminerService,
    ReportGenerationService,
    SuspiciousPatternDetectionService,
    ReportRetentionService,
    EncryptionAndIntegrityService,
    LargeTradeReportProcessor,
    SARBatchProcessor,
  ],
  exports: [
    RegulatoryReportingService,
    TradeReportingService,
    SARService,
    ComplianceService,
    ExaminerService,
    ReportGenerationService,
    SuspiciousPatternDetectionService,
    ReportRetentionService,
    EncryptionAndIntegrityService,
  ],
})
export class RegulatoryReportingModule {}
