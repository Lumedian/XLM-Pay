import { Injectable } from '@nestjs/common';
import { BaseStrategyService } from './base.strategy';
import { StrategyCalculationParams, OptimalPosition, RebalanceAmounts, LiquidityPosition, MarketData } from '../interfaces/strategy.interface';
import { StrategyType } from '../interfaces/amm-bot.interface';
import { ConcentratedLiquidityStrategyParams } from '../interfaces/strategy.interface';

@Injectable()
export class ConcentratedLiquidityStrategyService extends BaseStrategyService {
  type = StrategyType.CONCENTRATED_LIQUIDITY;
  name = 'Concentrated Liquidity';

  async calculateOptimalPosition(params: StrategyCalculationParams): Promise<OptimalPosition> {
    const { token0, token1, totalAmount, currentPrice, riskParameters, marketData } = params;
    
    // Calculate optimal tick range based on risk parameters
    const { priceRange } = riskParameters;
    const tickLower = this.priceToTick(priceRange.lower);
    const tickUpper = this.priceToTick(priceRange.upper);
    
    // Calculate liquidity amounts for concentrated range
    const { amount0, amount1, liquidity } = this.calculateLiquidityAmounts(
      totalAmount,
      currentPrice,
      priceRange.lower,
      priceRange.upper
    );
    
    const feeTier = 3000; // 0.3% fee tier
    const expectedAPR = this.calculateExpectedAPR(marketData, feeTier) * 2.5; // Higher APR for concentrated liquidity
    const riskScore = this.calculateRiskScore(params) * 1.2; // Higher risk for concentrated liquidity

    return {
      amount0,
      amount1,
      tickLower,
      tickUpper,
      expectedAPR,
      riskScore
    };
  }

  async shouldRebalance(currentPosition: LiquidityPosition, marketData: MarketData): Promise<boolean> {
    if (!currentPosition.tickLower || !currentPosition.tickUpper) {
      return false;
    }

    const lowerPrice = this.tickToPrice(currentPosition.tickLower);
    const upperPrice = this.tickToPrice(currentPosition.tickUpper);
    const currentPrice = marketData.currentPrice;

    // Rebalance if price moves out of range
    if (currentPrice < lowerPrice || currentPrice > upperPrice) {
      return true;
    }

    // Rebalance if price is near edge of range (within 10%)
    const rangeWidth = upperPrice - lowerPrice;
    const lowerBuffer = lowerPrice + (rangeWidth * 0.1);
    const upperBuffer = upperPrice - (rangeWidth * 0.1);
    
    return currentPrice < lowerBuffer || currentPrice > upperBuffer;
  }

  async calculateRebalanceAmounts(currentPosition: LiquidityPosition, marketData: MarketData): Promise<RebalanceAmounts> {
    const currentPrice = marketData.currentPrice;
    
    if (!currentPosition.tickLower || !currentPosition.tickUpper) {
      return {
        reason: 'Invalid position: missing tick bounds'
      };
    }

    const lowerPrice = this.tickToPrice(currentPosition.tickLower);
    const upperPrice = this.tickToPrice(currentPosition.tickUpper);

    // If price is out of range, suggest new range
    if (currentPrice < lowerPrice || currentPrice > upperPrice) {
      const newLowerPrice = currentPrice * 0.9;
      const newUpperPrice = currentPrice * 1.1;
      
      return {
        newTickLower: this.priceToTick(newLowerPrice),
        newTickUpper: this.priceToTick(newUpperPrice),
        reason: 'Price moved out of range, adjusting bounds'
      };
    }

    // Otherwise, suggest rebalancing within current range
    const totalValue = currentPosition.amount0 + (currentPosition.amount1 * currentPrice);
    const { amount0, amount1 } = this.calculateLiquidityAmounts(
      totalValue,
      currentPrice,
      lowerPrice,
      upperPrice
    );

    return {
      amount0ToAdd: Math.max(0, amount0 - currentPosition.amount0),
      amount1ToAdd: Math.max(0, amount1 - currentPosition.amount1),
      amount0ToRemove: Math.max(0, currentPosition.amount0 - amount0),
      amount1ToRemove: Math.max(0, currentPosition.amount1 - amount1),
      reason: 'Rebalancing within current range'
    };
  }

  private priceToTick(price: number): number {
    // Uniswap V3 tick calculation: tick = log1.00005(price) * 2^96
    const MIN_TICK = -887272;
    const MAX_TICK = 887272;
    
    const tick = Math.log(price) / Math.log(1.0001);
    return Math.max(MIN_TICK, Math.min(MAX_TICK, Math.floor(tick)));
  }

  private tickToPrice(tick: number): number {
    return Math.pow(1.0001, tick);
  }

  private calculateLiquidityAmounts(
    totalAmount: number,
    currentPrice: number,
    lowerPrice: number,
    upperPrice: number
  ): { amount0: number; amount1: number; liquidity: number } {
    // Simplified liquidity calculation for concentrated liquidity
    if (currentPrice < lowerPrice) {
      // All token0
      return {
        amount0: totalAmount,
        amount1: 0,
        liquidity: totalAmount
      };
    } else if (currentPrice > upperPrice) {
      // All token1
      return {
        amount0: 0,
        amount1: totalAmount / currentPrice,
        liquidity: totalAmount / currentPrice
      };
    } else {
      // Both tokens based on current price
      const priceRatio = currentPrice / upperPrice;
      const amount0 = totalAmount * (1 - Math.sqrt(priceRatio));
      const amount1 = (totalAmount - amount0) / currentPrice;
      
      return {
        amount0,
        amount1,
        liquidity: Math.sqrt(amount0 * amount1)
      };
    }
  }
}
