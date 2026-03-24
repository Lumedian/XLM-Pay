import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EmailService } from './email.service';
import { WebPushService } from './web-push.service';
import { TenantManagementService } from '../../tenancy/tenant-management.service';
import { TenantUsageService } from '../../tenancy/tenant-usage.service';
import { SmsService } from './sms.service';
import { TemplateService } from './template.service';
import { NotificationGateway } from '../notification.gateway';
import { NotificationChannel, NotificationType } from '@prisma/client';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly webPushService: WebPushService,
    private readonly tenantManagementService: TenantManagementService,
    private readonly tenantUsageService: TenantUsageService,
    private readonly smsService: SmsService,
    private readonly templateService: TemplateService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: any,
    tenantId?: string,
  ): Promise<void> {
    const tenant = tenantId
      ? await this.tenantManagementService.getTenantById(tenantId)
      : await this.tenantManagementService.getCurrentTenant();

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: tenant.id },
      include: { notificationSettings: true },
    });

    if (!user) {
      this.logger.warn(`User ${userId} not found for notification`);
      return;
    }

    // Default settings if none exist
    const settings = user.notificationSettings || {
      emailEnabled: true,
      pushEnabled: false,
      smsEnabled: false,
      websocketEnabled: true,
      notifyContributions: true,
      notifyMilestones: true,
      notifyDeadlines: true,
    };

    // Check specific preferences
    if (type === 'CONTRIBUTION' && !settings.notifyContributions) return;
    if (type === 'MILESTONE' && !settings.notifyMilestones) return;
    if (type === 'DEADLINE' && !settings.notifyDeadlines) return;

    // Use TemplateService to render content
    const renderedMessage = this.templateService.render(type, { ...data, message, title });

    // Save notification to history
    const notification = await this.prisma.notification.create({
      data: {
        tenantId: tenant.id,
        userId,
        type,
        title,
        message: renderedMessage,
        data,
      },
    });
    await this.tenantUsageService.recordUsageForTenantId(tenant.id, {
      metric: 'NOTIFICATION_SENT',
      quantity: 1,
      metadata: { type, title },
    });

    const deliveryBatch: Promise<void>[] = [];

    // Email
    if (settings.emailEnabled && user.email) {
      deliveryBatch.push(
        this.dispatch(notification.id, 'EMAIL', user.email, title, renderedMessage, tenant.id),
      );
    }

    // SMS
    if (settings.smsEnabled && user.phoneNumber) {
      deliveryBatch.push(
        this.dispatch(notification.id, 'SMS', user.phoneNumber, title, renderedMessage, tenant.id),
      );
    }

    // Web Push
    if (settings.pushEnabled && user.pushSubscription) {
      deliveryBatch.push(
        this.dispatch(
          notification.id,
          'PUSH',
          user.pushSubscription,
          title,
          renderedMessage,
          tenant.id,
          data,
        ),
      );
    }

    // WebSocket (Real-time) - Always try to send if enabled, but don't wait for it to track delivery
    if (settings.websocketEnabled) {
      const sent = this.notificationGateway.sendToUser(userId, 'notification', {
        id: notification.id,
        title,
        message: renderedMessage,
        type,
        data,
      });
      await this.prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: 'WEBSOCKET',
          status: sent ? 'SENT' : 'FAILED',
          errorMessage: sent ? null : 'User not connected',
        },
      });
    }

    // Run deliveries in parallel
    await Promise.all(deliveryBatch);
  }

  private async dispatch(
    notificationId: string,
    channel: NotificationChannel,
    target: any,
    title: string,
    message: string,
    tenantId: string,
    data?: any,
  ): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        notificationId,
        channel,
        status: 'PENDING',
      },
    });

    try {
      switch (channel) {
        case 'EMAIL':
          await this.emailService.sendEmail(target, title, `<p>${message}</p>`, tenantId);
          break;
        case 'SMS':
          await this.smsService.sendSms(target, message);
          break;
        case 'PUSH':
          await this.webPushService.sendNotification(target, { title, body: message, data });
          break;
      }

      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT' },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to dispatch ${channel}: ${errorMessage}`);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          errorMessage,
        },
      });
    }
  }
}
