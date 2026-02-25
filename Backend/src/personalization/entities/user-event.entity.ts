import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

export enum UserEventType {
  VIEW = 'view',
  CLICK = 'click',
  LIKE = 'like',
  DISLIKE = 'dislike',
  ADD_TO_CART = 'add_to_cart',
  PURCHASE = 'purchase',
  SEARCH = 'search',
  CUSTOM = 'custom',
}

@Entity('user_events')
@Index(['userId', 'timestamp'])
@Index(['tenantId', 'timestamp'])
@Index(['eventType', 'timestamp'])
export class UserEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId: string | null;

  @Column({ type: 'enum', enum: UserEventType })
  eventType: UserEventType;

  @Column({ type: 'varchar', length: 128, nullable: true })
  itemId: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  page: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  experimentId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  variant: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamp' })
  timestamp: Date;
}
