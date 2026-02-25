import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ExperimentStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
}

@Entity('experiments')
@Index(['key'], { unique: true })
export class Experiment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ExperimentStatus, default: ExperimentStatus.DRAFT })
  status: ExperimentStatus;

  @Column({ type: 'json' })
  variants: Array<{ name: string; weight: number }>;

  @Column({ type: 'varchar', length: 36, nullable: true })
  tenantId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
