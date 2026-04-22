import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum DexType {
  UNISWAP_V3 = 'uniswap_v3',
  CURVE = 'curve',
  BALANCER = 'balancer',
  STELLAR_DEX = 'stellar_dex',
}

export enum DexStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
}

@Entity('dex_configurations')
export class DexConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: DexType,
  })
  dexType: DexType;

  @Column({
    type: 'enum',
    enum: DexStatus,
    default: DexStatus.ACTIVE,
  })
  status: DexStatus;

  @Column('jsonb')
  configuration: {
    // Network configuration
    networkId: string;
    rpcUrl: string;
    chainId: number;
    
    // Contract addresses
    router: string;
    factory: string;
    quoter?: string;
    positionManager?: string;
    
    // Fee structure
    defaultFeeTier?: number;
    supportedFeeTiers?: number[];
    
    // Liquidity constraints
    minLiquidity: string;
    maxLiquidity: string;
    
    // Technical constraints
    maxGasPrice?: string;
    blockTime: number;
    confirmationBlocks: number;
    
    // API endpoints
    apiUrl?: string;
    websocketUrl?: string;
    
    // Stellar-specific configuration
    stellarNetwork?: string;
    horizonUrl?: string;
  };

  @Column('jsonb')
  supportedTokens: Array<{
    address: string;
    symbol: string;
    decimals: number;
    isActive: boolean;
  }>;

  @Column('jsonb')
  supportedPools: Array<{
    address: string;
    tokenA: string;
    tokenB: string;
    feeTier?: number;
    isActive: boolean;
    tvl?: string;
    volume24h?: string;
  }>;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  successRate: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  averageGasCost: string;

  @Column({ type: 'timestamp', nullable: true })
  lastHealthCheck: Date;

  @Column('jsonb', { nullable: true })
  healthMetrics: {
    latency: number;
    errorRate: number;
    uptime: number;
    lastBlockNumber?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
