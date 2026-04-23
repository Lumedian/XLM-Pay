import { Module } from '@nestjs/common';
import { ConstantProductStrategyService } from './constant-product.strategy';
import { ConcentratedLiquidityStrategyService } from './concentrated-liquidity.strategy';
import { DynamicFeesStrategyService } from './dynamic-fees.strategy';
import { StrategyFactory } from './strategy.factory';

@Module({
  providers: [
    ConstantProductStrategyService,
    ConcentratedLiquidityStrategyService,
    DynamicFeesStrategyService,
    StrategyFactory,
  ],
  exports: [
    ConstantProductStrategyService,
    ConcentratedLiquidityStrategyService,
    DynamicFeesStrategyService,
    StrategyFactory,
  ],
})
export class StrategyModule {}
