import { Injectable } from '@nestjs/common';
import { BaseStrategyService } from './base.strategy';
import { StrategyCalculationParams, OptimalPosition, RebalanceAmounts, LiquidityPosition, MarketData } from '../interfaces/strategy.interface';
import { StrategyType } from '../interfaces/amm-bot.interface';
import { DynamicFeesStrategyParams } from '../interfaces/strategy.interface';

@Injectable()
export class DynamicFeesStrategyService extends BaseStrategyService {
  type = StrategyType.DYNAMIC_FEES;
  name = 'Dynamic Fees';

  async calculateOptimalPosition(params: StrategyCalculationParams): Promise<OptimalPosition> {
    const { token0, token1, totalAmount, currentPrice, riskParameters, marketData } = params;
    
    // Calculate optimal fee tier based on volatility
    const volatility = Math.abs(marketData.price24hChange);
    const optimalFeeTier = this.calculateOptimalFeeTier(volatility);
    
    // Use concentrated liquidity approach with dynamic fees
    const { priceRange } = riskParameters;
    const tickLower = this.priceToTick(priceRange.lower);
    const tickUpper = this.priceToTick(priceRange.upper);
    
    const { amount0, amount1 } = this.calculateLiquidityAmounts(
      totalAmount,
      currentPrice,
      priceRange.lower,
      priceRange.upper
    );
    
    const expectedAPR = this.calculateExpectedAPR(marketData, optimalFeeTier) * 1.8; // Bonus for dynamic fees
    const riskScore = this.calculateRiskScore(params) * 1.1; // Slightly higher risk due to fee changes

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
    // Check if fee tier should be adjusted based on volatility
    const volatility = Math.abs(marketData.price24hChange);
    const currentFeeTier = currentPosition.feeTier || 3000;
    const optimalFeeTier = this.calculateOptimalFeeTier(volatility);
    
    if (Math.abs(currentFeeTier - optimalFeeTier) > 500) { // 0.05% difference threshold
      return true;
    }

    // Also check price range like concentrated liquidity
    if (currentPosition.tickLower && currentPosition.tickUpper) {
      const lowerPrice = this.tickToPrice(currentPosition.tickLower);
      const upperPrice = this.tickToPrice(currentPosition.tickUpper);
      const currentPrice = marketData.currentPrice;

      if (currentPrice < lowerPrice || currentPrice > upperPrice) {
        return true;
      }

      const rangeWidth = upperPrice - lowerPrice;
      const lowerBuffer = lowerPrice + (rangeWidth * 0.15); // 15% buffer
      const upperBuffer = upperPrice - (rangeWidth * 0.15);
      
      return currentPrice < lowerBuffer || currentPrice > upperBuffer;
    }

    return false;
  }

  async calculateRebalanceAmounts(currentPosition: LiquidityPosition, marketData: MarketData): Promise<RebalanceAmounts> {
    const currentPrice = marketData.currentPrice;
    const volatility = Math.abs(marketData.price24hChange);
    const optimalFeeTier = this.calculateOptimalFeeTier(volatility);
    
    if (currentPosition.tickLower && currentPosition.tickUpper) {
      const lowerPrice = this.tickToPrice(currentPosition.tickLower);
      const upperPrice = this.tickToPrice(currentPosition.tickUpper);

      // If price is out of range, suggest new range and fee tier
      if (currentPrice < lowerPrice || currentPrice > upperPrice) {
        const newLowerPrice = currentPrice * 0.85; // Tighter range for dynamic fees
        const newUpperPrice = currentPrice * 1.15;
        
        return {
          newTickLower: this.priceToTick(newLowerPrice),
          newTickUpper: this.priceToTick(newUpperPrice),
          reason: `Price moved out of range and fee tier adjustment needed (${optimalFeeTier}bps)`
        };
      }

      // Check if fee tier needs adjustment
      const currentFeeTier = currentPosition.feeTier || 3000;
      if (Math.abs(currentFeeTier - optimalFeeTier) > 500) {
        return {
          reason: `Fee tier adjustment needed: ${currentFeeTier} -> ${optimalFeeTier}bps based on volatility`
        };
      }
    }

    return {
      reason: 'No rebalancing needed'
    };
  }

  private calculateOptimalFeeTier(volatility: number): number {
    // Dynamic fee tier selection based on volatility
    if (volatility < 0.02) {
      return 100; // 0.01% for low volatility
    } else if (volatility < 0.05) {
      return 500; // 0.05% for medium volatility
    } else if (volatility < 0.10) {
      return 3000; // 0.3% for high volatility
    } else {
      return 10000; // 1% for very high volatility
    }
  }

  private priceToTick(price: number): number {
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
  ): { amount0: number; amount1: number } {
    if (currentPrice < lowerPrice) {
      return {
        amount0: totalAmount,
        amount1: 0
      };
    } else if (currentPrice > upperPrice) {
      return {
        amount0: 0,
        amount1: totalAmount / currentPrice
      };
    } else {
      const priceRatio = currentPrice / upperPrice;
      const amount0 = totalAmount * (1 - Math.sqrt(priceRatio));
      const amount1 = (totalAmount - amount0) / currentPrice;
      
      return {
        amount0,
        amount1
      };
    }
  }
}
