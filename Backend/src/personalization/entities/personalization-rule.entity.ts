import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RuleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('personalization_rules')
@Index(['tenantId', 'priority'])
export class PersonalizationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: RuleStatus, default: RuleStatus.ACTIVE })
  status: RuleStatus;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'json' })
  conditions: any;

  @Column({ type: 'json' })
  actions: any;

  @Column({ type: 'varchar', length: 36, nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
