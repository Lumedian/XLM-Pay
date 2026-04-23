import { StrategyType, RiskParameters } from './amm-bot.interface';

export interface BaseStrategy {
  type: StrategyType;
  name: string;
  calculateOptimalPosition(params: StrategyCalculationParams): Promise<OptimalPosition>;
  shouldRebalance(currentPosition: LiquidityPosition, marketData: MarketData): Promise<boolean>;
  calculateRebalanceAmounts(currentPosition: LiquidityPosition, marketData: MarketData): Promise<RebalanceAmounts>;
}

export interface StrategyCalculationParams {
  token0: string;
  token1: string;
  totalAmount: number;
  currentPrice: number;
  riskParameters: RiskParameters;
  marketData: MarketData;
}

export interface OptimalPosition {
  amount0: number;
  amount1: number;
  tickLower?: number;
  tickUpper?: number;
  expectedAPR: number;
  riskScore: number;
}

export interface RebalanceAmounts {
  amount0ToAdd?: number;
  amount1ToAdd?: number;
  amount0ToRemove?: number;
  amount1ToRemove?: number;
  newTickLower?: number;
  newTickUpper?: number;
  reason: string;
}

export interface LiquidityPosition {
  id: string;
  token0: string;
  token1: string;
  amount0: number;
  amount1: number;
  poolAddress: string;
  tickLower?: number;
  tickUpper?: number;
  feeTier?: number;
}

export interface MarketData {
  token0: string;
  token1: string;
  currentPrice: number;
  price24hChange: number;
  volume24h: number;
  liquidity: number;
  timestamp: Date;
}

export interface ConstantProductStrategyParams {
  feeTier: number;
}

export interface ConcentratedLiquidityStrategyParams {
  tickLower: number;
  tickUpper: number;
  feeTier: number;
  widthMultiplier: number;
}

export interface DynamicFeesStrategyParams {
  baseFeeTier: number;
  volatilityThreshold: number;
  feeMultiplier: number;
  adjustmentFrequency: number;
}
