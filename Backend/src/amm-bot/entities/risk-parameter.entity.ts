import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { BotStrategy } from './bot-strategy.entity';

export enum RiskType {
  MAX_POSITION_SIZE = 'max_position_size',
  MAX_DRAWDOWN = 'max_drawdown',
  IMPERMANENT_LOSS_LIMIT = 'impermanent_loss_limit',
  PRICE_DEVIATION_LIMIT = 'price_deviation_limit',
  CORRELATION_LIMIT = 'correlation_limit',
  CONCENTRATION_LIMIT = 'concentration_limit',
}

export enum RiskStatus {
  ACTIVE = 'active',
  TRIGGERED = 'triggered',
  DISABLED = 'disabled',
}

@Entity('risk_parameters')
export class RiskParameter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BotStrategy, strategy => strategy.riskParameters)
  strategy: BotStrategy;

  @Column()
  strategyId: string;

  @Column({
    type: 'enum',
    enum: RiskType,
  })
  riskType: RiskType;

  @Column({
    type: 'enum',
    enum: RiskStatus,
    default: RiskStatus.ACTIVE,
  })
  status: RiskStatus;

  @Column('decimal', { precision: 36, scale: 18 })
  threshold: string;

  @Column('decimal', { precision: 36, scale: 18, nullable: true })
  currentValue: string;

  @Column('decimal', { precision: 36, scale: 18, nullable: true })
  triggerValue: string;

  @Column('jsonb', { nullable: true })
  parameters: {
    // Risk-specific parameters
    maxPercentage?: number;
    timeWindow?: number;
    lookbackPeriod?: number;
    tokens?: string[];
    dexes?: string[];
    rebalanceAction?: 'reduce_position' | 'close_position' | 'pause_strategy';
  };

  @Column({ type: 'timestamp', nullable: true })
  lastTriggeredAt: Date;

  @Column({ default: 0 })
  triggerCount: number;

  @Column('text', { nullable: true })
  description: string;

  @Column('jsonb', { nullable: true })
  alertConfig: {
    enabled: boolean;
    channels: string[];
    threshold?: string;
    cooldownPeriod?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
