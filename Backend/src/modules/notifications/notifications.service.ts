import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationPreference, NotificationChannel } from './entities/notification-preference.entity';
import { NotificationTemplate } from './entities/notification-template.entity';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepo: Repository<Notification>,
        @InjectRepository(NotificationPreference)
        private readonly preferenceRepo: Repository<NotificationPreference>,
        @InjectRepository(NotificationTemplate)
        private readonly templateRepo: Repository<NotificationTemplate>,
        @InjectQueue('notifications')
        private readonly notificationQueue: Queue,
    ) { }

    async sendNotification(
        userId: string,
        type: NotificationType,
        data: any,
        options: { title?: string; message?: string } = {},
    ) {
        // 1. Get preferences
        const preferences = await this.preferenceRepo.find({
            where: { userId, type },
        });

        // If no preferences set, we can either default to all or some.
        // Let's default to IN_APP if none specified.
        const enabledChannels = preferences.length > 0
            ? preferences.filter(p => p.isEnabled).map(p => p.channel)
            : [NotificationChannel.IN_APP];

        if (enabledChannels.length === 0) {
            this.logger.debug(`User ${userId} has disabled all channels for ${type}`);
            return;
        }

        // 2. Save IN_APP notification to history if enabled
        let notificationId: string | undefined;
        if (enabledChannels.includes(NotificationChannel.IN_APP)) {
            const notification = this.notificationRepo.create({
                userId,
                type,
                title: options.title || `New ${type} Notification`,
                message: options.message || JSON.stringify(data),
                data,
            });
            const saved = await this.notificationRepo.save(notification);
            notificationId = saved.id;
        }

        // 3. Queue jobs for each channel
        for (const channel of enabledChannels) {
            await this.notificationQueue.add('send-notification', {
                userId,
                notificationId,
                type,
                channel,
                data,
                options,
            });
        }

        this.logger.log(`Queued notification for user ${userId}, type ${type}, channels: ${enabledChannels.join(', ')}`);
    }

    async getPreferences(userId: string) {
        return this.preferenceRepo.find({ where: { userId } });
    }

    async updatePreference(
        userId: string,
        type: NotificationType,
        channel: NotificationChannel,
        isEnabled: boolean,
    ) {
        let preference = await this.preferenceRepo.findOne({
            where: { userId, type, channel },
        });

        if (preference) {
            preference.isEnabled = isEnabled;
        } else {
            preference = this.preferenceRepo.create({
                userId,
                type,
                channel,
                isEnabled,
            });
        }

        return this.preferenceRepo.save(preference);
    }

    async getHistory(userId: string, limit = 20, offset = 0) {
        return this.notificationRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: limit,
            skip: offset,
        });
    }

    async markAsRead(notificationId: string) {
        return this.notificationRepo.update(notificationId, {
            isRead: true,
            readAt: new Date(),
        });
    }

    async markAllAsRead(userId: string) {
        return this.notificationRepo.update(
            { userId, isRead: false },
            { isRead: true, readAt: new Date() },
        );
    }
}
