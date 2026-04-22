import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { BotStrategy } from './bot-strategy.entity';

export enum MetricType {
  PNL = 'pnl',
  FEES_EARNED = 'fees_earned',
  IMPERMANENT_LOSS = 'impermanent_loss',
  TVL = 'tvl',
  APR = 'apr',
  VOLUME = 'volume',
}

@Entity('performance_metrics')
export class PerformanceMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BotStrategy)
  strategy: BotStrategy;

  @Column()
  strategyId: string;

  @Column({
    type: 'enum',
    enum: MetricType,
  })
  metricType: MetricType;

  @Column('decimal', { precision: 36, scale: 18 })
  value: string;

  @Column('decimal', { precision: 36, scale: 18, nullable: true })
  previousValue: string;

  @Column('decimal', { precision: 36, scale: 18, nullable: true })
  changePercentage: string;

  @Column('jsonb', { nullable: true })
  breakdown: {
    byDex: Record<string, string>;
    byToken: Record<string, string>;
    byTimeframe: Record<string, string>;
  };

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column()
  timeframe: string; // '1h', '1d', '1w', '1m'

  @CreateDateColumn()
  createdAt: Date;
}
