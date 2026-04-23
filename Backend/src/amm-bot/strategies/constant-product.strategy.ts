import { Injectable } from '@nestjs/common';
import { BaseStrategyService } from './base.strategy';
import { StrategyCalculationParams, OptimalPosition, RebalanceAmounts, LiquidityPosition, MarketData } from '../interfaces/strategy.interface';
import { StrategyType } from '../interfaces/amm-bot.interface';
import { ConstantProductStrategyParams } from '../interfaces/strategy.interface';

@Injectable()
export class ConstantProductStrategyService extends BaseStrategyService {
  type = StrategyType.CONSTANT_PRODUCT;
  name = 'Constant Product AMM';

  async calculateOptimalPosition(params: StrategyCalculationParams): Promise<OptimalPosition> {
    const { token0, token1, totalAmount, currentPrice, riskParameters, marketData } = params;
    
    // For constant product, we provide liquidity across the entire range
    const amount0 = totalAmount * 0.5;
    const amount1 = (totalAmount * 0.5) * currentPrice;
    
    const feeTier = 3000; // 0.3% standard fee tier
    const expectedAPR = this.calculateExpectedAPR(marketData, feeTier);
    const riskScore = this.calculateRiskScore(params);

    return {
      amount0,
      amount1,
      expectedAPR,
      riskScore
    };
  }

  async shouldRebalance(currentPosition: LiquidityPosition, marketData: MarketData): Promise<boolean> {
    // Check if position is significantly imbalanced
    const currentValue = currentPosition.amount0 + (currentPosition.amount1 * marketData.currentPrice);
    const targetValue0 = currentValue * 0.5;
    const targetValue1 = currentValue * 0.5;
    
    const deviation0 = Math.abs(currentPosition.amount0 - targetValue0) / targetValue0;
    const deviation1 = Math.abs(currentPosition.amount1 - targetValue1) / targetValue1;
    
    // Rebalance if deviation exceeds 20%
    return deviation0 > 0.2 || deviation1 > 0.2;
  }

  async calculateRebalanceAmounts(currentPosition: LiquidityPosition, marketData: MarketData): Promise<RebalanceAmounts> {
    const currentValue = currentPosition.amount0 + (currentPosition.amount1 * marketData.currentPrice);
    const targetValue0 = currentValue * 0.5;
    const targetValue1 = currentValue * 0.5;
    
    const amount0ToAdd = Math.max(0, targetValue0 - currentPosition.amount0);
    const amount1ToAdd = Math.max(0, targetValue1 - currentPosition.amount1);
    const amount0ToRemove = Math.max(0, currentPosition.amount0 - targetValue0);
    const amount1ToRemove = Math.max(0, currentPosition.amount1 - targetValue1);
    
    return {
      amount0ToAdd: amount0ToAdd > 0 ? amount0ToAdd : undefined,
      amount1ToAdd: amount1ToAdd > 0 ? amount1ToAdd : undefined,
      amount0ToRemove: amount0ToRemove > 0 ? amount0ToRemove : undefined,
      amount1ToRemove: amount1ToRemove > 0 ? amount1ToRemove : undefined,
      reason: 'Rebalancing to maintain 50/50 ratio'
    };
  }

  private calculateConstantProduct(amount0: number, amount1: number): number {
    return amount0 * amount1;
  }

  private calculateOptimalAmounts(totalAmount: number, price: number): { amount0: number; amount1: number } {
    // For CP AMM, optimal is 50/50 value ratio
    const amount0 = totalAmount / (1 + price);
    const amount1 = (totalAmount - amount0) / price;
    return { amount0, amount1 };
  }
}
