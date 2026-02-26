import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('experiment_assignments')
@Index(['experimentKey', 'userId'], { unique: true })
export class ExperimentAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  experimentKey: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 64 })
  variant: string;

  @CreateDateColumn({ type: 'timestamp' })
  assignedAt: Date;
}
