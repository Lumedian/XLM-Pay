import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EmailService } from './email.service';
import { WebPushService } from './web-push.service';
import { TenantManagementService } from '../../tenancy/tenant-management.service';
import { TenantUsageService } from '../../tenancy/tenant-usage.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly webPushService: WebPushService,
    private readonly tenantManagementService: TenantManagementService,
    private readonly tenantUsageService: TenantUsageService,
  ) {}

  async notify(
    userId: string,
    type: 'CONTRIBUTION' | 'MILESTONE' | 'DEADLINE' | 'SYSTEM',
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
      notifyContributions: true,
      notifyMilestones: true,
      notifyDeadlines: true,
    };

    // Check specific preferences
    if (type === 'CONTRIBUTION' && !settings.notifyContributions) return;
    if (type === 'MILESTONE' && !settings.notifyMilestones) return;
    if (type === 'DEADLINE' && !settings.notifyDeadlines) return;

    // Save notification to history
    await this.prisma.notification.create({
      data: {
        tenantId: tenant.id,
        userId,
        type,
        title,
        message,
        data,
      },
    });
    await this.tenantUsageService.recordUsageForTenantId(tenant.id, {
      metric: 'NOTIFICATION_SENT',
      quantity: 1,
      metadata: { type, title },
    });

    // Dispatch via Email
    if (settings.emailEnabled && user.email) {
      try {
        await this.emailService.sendEmail(user.email, title, `<p>${message}</p>`, tenant.id);
      } catch (err) {
        this.logger.error(`Failed to send email to ${user.email} for notification ${title}`);
      }
    }

    // Dispatch via Web Push
    if (settings.pushEnabled && user.pushSubscription) {
      try {
        await this.webPushService.sendNotification(user.pushSubscription as any, {
          title,
          body: message,
          data,
        });
      } catch (err) {
        this.logger.error(`Failed to send web push for user ${userId}`);
      }
    }
  }
}
