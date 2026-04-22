import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DifferentialPrivacyService } from './differential-privacy.service';
import { PrivacyBudgetService } from './privacy-budget.service';
import { DatabaseModule } from '../database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, DifferentialPrivacyService, PrivacyBudgetService],
  exports: [AnalyticsService, DifferentialPrivacyService, PrivacyBudgetService],
})
export class AnalyticsModule {}
