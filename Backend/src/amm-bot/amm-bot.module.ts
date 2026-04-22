import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AmmBotService } from './amm-bot.service';
import { AmmBotController } from './amm-bot.controller';
import { StrategyService } from './services/strategy.service';
import { RiskManagementService } from './services/risk-management.service';
import { PerformanceTrackingService } from './services/performance-tracking.service';
import { DexIntegrationService } from './services/dex-integration.service';
import { ImpermanentLossService } from './services/impermanent-loss.service';
import { RebalanceService } from './services/rebalance.service';
import { BotStrategy } from './entities/bot-strategy.entity';
import { BotPosition } from './entities/bot-position.entity';
import { PerformanceMetric } from './entities/performance-metric.entity';
import { RiskParameter } from './entities/risk-parameter.entity';
import { DexConfiguration } from './entities/dex-configuration.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BotStrategy,
      BotPosition,
      PerformanceMetric,
      RiskParameter,
      DexConfiguration,
    ]),
    ScheduleModule,
  ],
  controllers: [AmmBotController],
  providers: [
    AmmBotService,
    StrategyService,
    RiskManagementService,
    PerformanceTrackingService,
    DexIntegrationService,
    ImpermanentLossService,
    RebalanceService,
  ],
  exports: [
    AmmBotService,
    StrategyService,
    RiskManagementService,
    PerformanceTrackingService,
    DexIntegrationService,
    ImpermanentLossService,
    RebalanceService,
  ],
})
export class AmmBotModule {}
