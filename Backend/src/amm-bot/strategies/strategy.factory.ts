import { Injectable, Inject } from '@nestjs/common';
import { StrategyType } from '../interfaces/amm-bot.interface';
import { BaseStrategy } from '../interfaces/strategy.interface';
import { ConstantProductStrategyService } from './constant-product.strategy';
import { ConcentratedLiquidityStrategyService } from './concentrated-liquidity.strategy';
import { DynamicFeesStrategyService } from './dynamic-fees.strategy';

@Injectable()
export class StrategyFactory {
  constructor(
    private readonly constantProductStrategy: ConstantProductStrategyService,
    private readonly concentratedLiquidityStrategy: ConcentratedLiquidityStrategyService,
    private readonly dynamicFeesStrategy: DynamicFeesStrategyService,
  ) {}

  getStrategy(type: StrategyType): BaseStrategy {
    switch (type) {
      case StrategyType.CONSTANT_PRODUCT:
        return this.constantProductStrategy;
      case StrategyType.CONCENTRATED_LIQUIDITY:
        return this.concentratedLiquidityStrategy;
      case StrategyType.DYNAMIC_FEES:
        return this.dynamicFeesStrategy;
      default:
        throw new Error(`Unsupported strategy type: ${type}`);
    }
  }

  getAllStrategies(): BaseStrategy[] {
    return [
      this.constantProductStrategy,
      this.concentratedLiquidityStrategy,
      this.dynamicFeesStrategy,
    ];
  }

  getSupportedStrategyTypes(): StrategyType[] {
    return Object.values(StrategyType);
  }
}
