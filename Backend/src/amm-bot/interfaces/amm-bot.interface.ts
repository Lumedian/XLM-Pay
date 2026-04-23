export enum StrategyType {
  CONSTANT_PRODUCT = 'CONSTANT_PRODUCT',
  CONCENTRATED_LIQUIDITY = 'CONCENTRATED_LIQUIDITY',
  DYNAMIC_FEES = 'DYNAMIC_FEES'
}

export enum DexType {
  UNISWAP_V3 = 'UNISWAP_V3',
  CURVE = 'CURVE',
  BALANCER = 'BALANCER'
}

export enum BotStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR'
}

export interface RiskParameters {
  maxPositionSize: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  priceRange: {
    lower: number;
    upper: number;
  };
  rebalanceTrigger: number;
  maxSlippage: number;
}

export interface StrategyConfig {
  type: StrategyType;
  name: string;
  description: string;
  riskParameters: RiskParameters;
  specificParams: Record<string, any>;
}

export interface LiquidityPosition {
  id: string;
  token0: string;
  token1: string;
  amount0: number;
  amount1: number;
  poolAddress: string;
  dexType: DexType;
  tickLower?: number;
  tickUpper?: number;
  feeTier?: number;
}

export interface PerformanceMetrics {
  totalValueLocked: number;
  feeRevenue: number;
  impermanentLoss: number;
  netProfit: number;
  apr: number;
  volume24h: number;
  lastUpdateTime: Date;
}

export interface AmmBot {
  id: string;
  userId: string;
  name: string;
  strategy: StrategyConfig;
  positions: LiquidityPosition[];
  status: BotStatus;
  performance: PerformanceMetrics;
  createdAt: Date;
  updatedAt: Date;
  lastRebalanceAt?: Date;
}

export interface RebalanceSignal {
  botId: string;
  positionId: string;
  type: 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY' | 'ADJUST_RANGE';
  amount0?: number;
  amount1?: number;
  newTickLower?: number;
  newTickUpper?: number;
  timestamp: Date;
  reason: string;
}

export interface DexIntegration {
  type: DexType;
  name: string;
  supportedTokens: string[];
  feeTiers: number[];
  isActive: boolean;
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
