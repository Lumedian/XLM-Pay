import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsGateway } from './notifications.gateway';
import { EmailProvider } from './providers/email.provider';
import { PushProvider } from './providers/push.provider';
import { RedisModule } from '../../redis/redis.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Notification,
            NotificationPreference,
            NotificationTemplate,
        ]),
        BullModule.registerQueue({
            name: 'notifications',
        }),
        RedisModule,
    ],
    providers: [
        NotificationsService,
        NotificationsProcessor,
        NotificationsGateway,
        EmailProvider,
        PushProvider,
    ],
    controllers: [NotificationsController],
    exports: [NotificationsService],
})
export class NotificationsModule { }
