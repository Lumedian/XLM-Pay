import { DexType } from './amm-bot.interface';

export interface DexIntegration {
  type: DexType;
  name: string;
  initialize(config: DexConfig): Promise<void>;
  getPoolData(token0: string, token1: string): Promise<PoolData>;
  addLiquidity(params: AddLiquidityParams): Promise<TransactionResult>;
  removeLiquidity(params: RemoveLiquidityParams): Promise<TransactionResult>;
  collectFees(positionId: string): Promise<FeeCollection>;
  getPositionData(positionId: string): Promise<PositionData>;
  getCurrentPrice(token0: string, token1: string): Promise<number>;
  getSupportedTokens(): Promise<string[]>;
}

export interface DexConfig {
  rpcUrl: string;
  privateKey?: string;
  gasLimit?: number;
  gasPrice?: number;
  maxSlippage?: number;
}

export interface PoolData {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  liquidity: number;
  sqrtPriceX96?: string;
  tick?: number;
  tickSpacing?: number;
  volume24h: number;
  fee24h: number;
}

export interface AddLiquidityParams {
  token0: string;
  token1: string;
  amount0: number;
  amount1: number;
  tickLower?: number;
  tickUpper?: number;
  feeTier?: number;
  minAmount0?: number;
  minAmount1?: number;
  deadline?: number;
}

export interface RemoveLiquidityParams {
  positionId: string;
  liquidityAmount?: number;
  amount0Min?: number;
  amount1Min?: number;
  deadline?: number;
}

export interface TransactionResult {
  hash: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  gasUsed?: number;
  error?: string;
}

export interface FeeCollection {
  amount0: number;
  amount1: number;
  timestamp: Date;
}

export interface PositionData {
  id: string;
  token0: string;
  token1: string;
  amount0: number;
  amount1: number;
  liquidity: number;
  tickLower?: number;
  tickUpper?: number;
  feeTier?: number;
  uncollectedFees0: number;
  uncollectedFees1: number;
  lastUpdate: Date;
}

export interface UniswapV3Config extends DexConfig {
  routerAddress: string;
  quoterAddress: string;
  nonfungiblePositionManagerAddress: string;
}

export interface CurveConfig extends DexConfig {
  factoryAddress: string;
  registryAddress: string;
  poolTemplateAddress: string;
}

export interface BalancerConfig extends DexConfig {
  vaultAddress: string;
  weightedPoolFactoryAddress: string;
}
