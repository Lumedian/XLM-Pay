import { Injectable } from '@nestjs/common';
import { BaseStrategy, StrategyCalculationParams, OptimalPosition, RebalanceAmounts, LiquidityPosition, MarketData } from '../interfaces/strategy.interface';
import { StrategyType } from '../interfaces/amm-bot.interface';

@Injectable()
export abstract class BaseStrategyService implements BaseStrategy {
  abstract type: StrategyType;
  abstract name: string;

  abstract calculateOptimalPosition(params: StrategyCalculationParams): Promise<OptimalPosition>;
  
  abstract shouldRebalance(currentPosition: LiquidityPosition, marketData: MarketData): Promise<boolean>;
  
  abstract calculateRebalanceAmounts(currentPosition: LiquidityPosition, marketData: MarketData): Promise<RebalanceAmounts>;

  protected calculateRiskScore(params: StrategyCalculationParams): number {
    const { riskParameters, marketData } = params;
    let riskScore = 0;

    // Volatility risk
    const volatility = Math.abs(marketData.price24hChange);
    riskScore += volatility * 0.3;

    // Position size risk
    const positionSizeRisk = (riskParameters.maxPositionSize / 1000000) * 0.2; // Assuming 1M base
    riskScore += positionSizeRisk;

    // Price range risk
    const rangeWidth = riskParameters.priceRange.upper - riskParameters.priceRange.lower;
    const rangeRisk = (1 - (rangeWidth / marketData.currentPrice)) * 0.3;
    riskScore += rangeRisk;

    // Stop loss risk
    const stopLossRisk = riskParameters.stopLossPercentage * 0.2;
    riskScore += stopLossRisk;

    return Math.min(riskScore, 1);
  }

  protected calculateExpectedAPR(marketData: MarketData, feeTier: number): number {
    const baseAPR = 0.05; // 5% base APR
    const volumeMultiplier = Math.min(marketData.volume24h / 1000000, 2); // Cap at 2x
    const feeMultiplier = feeTier / 10000; // Convert basis points
    
    return baseAPR * volumeMultiplier * (1 + feeMultiplier);
  }

  protected isPriceInRange(currentPrice: number, lower: number, upper: number): boolean {
    return currentPrice >= lower && currentPrice <= upper;
  }

  protected calculatePriceDeviation(currentPrice: number, targetPrice: number): number {
    return Math.abs((currentPrice - targetPrice) / targetPrice);
  }
}
