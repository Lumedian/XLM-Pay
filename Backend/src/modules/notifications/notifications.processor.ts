import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { NotificationChannel } from './entities/notification-preference.entity';
import { EmailProvider } from './providers/email.provider';
import { PushProvider } from './providers/push.provider';
import { NotificationsGateway } from './notifications.gateway';

@Processor('notifications')
export class NotificationsProcessor {
    private readonly logger = new Logger(NotificationsProcessor.name);

    constructor(
        private readonly emailProvider: EmailProvider,
        private readonly pushProvider: PushProvider,
        private readonly notificationsGateway: NotificationsGateway,
    ) { }

    @Process('send-notification')
    async handleSendNotification(job: Job<any>) {
        const { userId, notificationId, type, channel, data, options } = job.data;
        this.logger.debug(`Processing notification for user ${userId}, channel ${channel}`);

        try {
            switch (channel) {
                case NotificationChannel.IN_APP:
                    // For IN_APP, we emit via WebSocket
                    await this.notificationsGateway.sendToUser(userId, 'notification', {
                        id: notificationId,
                        type,
                        data,
                        title: options?.title || `New ${type} Notification`,
                        message: options?.message || JSON.stringify(data),
                    });
                    break;

                case NotificationChannel.EMAIL:
                    await this.emailProvider.send(userId, type, data, options);
                    break;

                case NotificationChannel.PUSH:
                    await this.pushProvider.send(userId, type, data, options);
                    break;

                default:
                    this.logger.warn(`Unknown notification channel: ${channel}`);
            }
        } catch (error) {
            this.logger.error(`Failed to process notification for user ${userId} on channel ${channel}: ${error.message}`);
            throw error;
        }
    }
}
