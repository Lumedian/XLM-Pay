import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { BotStrategy } from './bot-strategy.entity';

export enum PositionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  CLOSED = 'closed',
}

export enum PositionType {
  LIQUIDITY = 'liquidity',
  SINGLE_ASSET = 'single_asset',
}

@Entity('bot_positions')
export class BotPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BotStrategy, strategy => strategy.positions)
  strategy: BotStrategy;

  @Column()
  strategyId: string;

  @Column()
  dexName: string;

  @Column()
  poolAddress: string;

  @Column()
  tokenA: string;

  @Column()
  tokenB: string;

  @Column({
    type: 'enum',
    enum: PositionType,
  })
  positionType: PositionType;

  @Column({
    type: 'enum',
    enum: PositionStatus,
    default: PositionStatus.ACTIVE,
  })
  status: PositionStatus;

  @Column('decimal', { precision: 36, scale: 18 })
  amountA: string;

  @Column('decimal', { precision: 36, scale: 18 })
  amountB: string;

  @Column('decimal', { precision: 36, scale: 18, default: 0 })
  feesEarnedA: string;

  @Column('decimal', { precision: 36, scale: 18, default: 0 })
  feesEarnedB: string;

  @Column('decimal', { precision: 36, scale: 18, default: 0 })
  impermanentLoss: string;

  @Column('jsonb', { nullable: true })
  priceRange: {
    lowerBound: string;
    upperBound: string;
    currentPrice: string;
  };

  @Column('jsonb', { nullable: true })
  liquidityData: {
    liquidityTokenAmount: string;
    tickLower: number;
    tickUpper: number;
    currentTick: number;
  };

  @Column({ type: 'timestamp', nullable: true })
  lastFeeCollectionAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastRebalanceAt: Date;

  @Column('jsonb', { nullable: true })
  dexSpecificData: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
