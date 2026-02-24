import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { NotificationType } from './notification.entity';
import { NotificationChannel } from './notification-preference.entity';

@Entity('notification_templates')
@Unique(['type', 'channel'])
export class NotificationTemplate {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        type: 'enum',
        enum: NotificationType,
    })
    type: NotificationType;

    @Column({
        type: 'enum',
        enum: NotificationChannel,
    })
    channel: NotificationChannel;

    @Column({ nullable: true })
    subject: string;

    @Column('text')
    body: string;
}
