import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne } from 'typeorm';
import { BotPosition } from './bot-position.entity';
import { RiskParameter } from './risk-parameter.entity';
import { DexConfiguration } from './dex-configuration.entity';

export enum StrategyType {
  CONSTANT_PRODUCT = 'constant_product',
  CONCENTRATED_LIQUIDITY = 'concentrated_liquidity',
  DYNAMIC_FEES = 'dynamic_fees',
}

export enum StrategyStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
}

@Entity('bot_strategies')
export class BotStrategy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: StrategyType,
  })
  strategyType: StrategyType;

  @Column({
    type: 'enum',
    enum: StrategyStatus,
    default: StrategyStatus.ACTIVE,
  })
  status: StrategyStatus;

  @Column('jsonb')
  configuration: {
    // Common configuration
    totalLiquidity: string;
    rebalanceThreshold: number;
    maxSlippage: number;
    
    // Strategy-specific configuration
    priceRange?: {
      lowerBound: string;
      upperBound: string;
    };
    feeTier?: number;
    rebalanceTriggers?: {
      priceDeviation: number;
      timeInterval: number;
      impermanentLossThreshold: number;
    };
  };

  @Column('jsonb')
  dexConfigurations: Array<{
    dexName: string;
    poolAddress: string;
    tokenPair: {
      tokenA: string;
      tokenB: string;
    };
    allocation: number; // Percentage of total liquidity
  }>;

  @OneToMany(() => BotPosition, position => position.strategy)
  positions: BotPosition[];

  @OneToMany(() => RiskParameter, riskParam => riskParam.strategy)
  riskParameters: RiskParameter[];

  @Column({ default: 0 })
  totalDeposited: string;

  @Column({ default: 0 })
  totalWithdrawn: string;

  @Column({ default: 0 })
  currentLiquidity: string;

  @Column({ default: 0 })
  totalFeesEarned: string;

  @Column({ default: 0 })
  impermanentLoss: string;

  @Column({ type: 'timestamp', nullable: true })
  lastRebalanceAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextRebalanceAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
