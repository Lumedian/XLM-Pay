import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { LongevityController } from './longevity.controller';
import { LongevityService } from './longevity.service';
import { ResearchAggregatorService } from './research-aggregator.service';
import { ClinicalTrialsService } from './clinical-trials.service';
import { PredictionMarketService } from './prediction-market.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
  ],
  controllers: [LongevityController],
  providers: [
    LongevityService,
    ResearchAggregatorService,
    ClinicalTrialsService,
    PredictionMarketService,
    PrismaService,
  ],
  exports: [LongevityService, PredictionMarketService],
})
export class LongevityModule {}
