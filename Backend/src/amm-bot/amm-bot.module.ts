import { Module } from '@nestjs/common';
import { AmmBotController } from './controllers/amm-bot.controller';
import { AmmBotService } from './services/amm-bot.service';
import { DeploymentService } from './services/deployment.service';
import { RebalancingService } from './services/rebalancing.service';
import { DashboardService } from './analytics/dashboard.service';
import { PerformanceAnalyticsService } from './analytics/performance-analytics.service';
import { ImpermanentLossService } from './analytics/impermanent-loss.service';
import { RiskConfigService } from './config/risk-config.service';

// Import sub-modules
import { StrategyModule } from './strategies/strategy.module';
import { DexModule } from './integrations/dex.module';

@Module({
  imports: [
    StrategyModule,
    DexModule,
  ],
  controllers: [
    AmmBotController,
  ],
  providers: [
    AmmBotService,
    DeploymentService,
    RebalancingService,
    DashboardService,
    PerformanceAnalyticsService,
    ImpermanentLossService,
    RiskConfigService,
  ],
  exports: [
    AmmBotService,
    DeploymentService,
    RebalancingService,
    DashboardService,
    PerformanceAnalyticsService,
    ImpermanentLossService,
    RiskConfigService,
  ],
})
export class AmmBotModule {}
