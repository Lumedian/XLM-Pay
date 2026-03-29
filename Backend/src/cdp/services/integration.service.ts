import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface IntegrationConfig {
  id: string;
  name: string;
  type: 'email' | 'push' | 'sms' | 'webhook' | 'analytics';
  apiKey?: string;
  webhookUrl?: string;
  settings: Record<string, any>;
  isActive: boolean;
}

export interface ActivationResult {
  integration: string;
  status: 'success' | 'failed';
  message: string;
  activatedUsers?: number;
  failedUsers?: number;
}

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);
  private readonly integrations: Map<string, IntegrationConfig> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.initializeDefaultIntegrations();
  }

  private initializeDefaultIntegrations() {
    // Initialize default integrations
    this.integrations.set('sendgrid', {
      id: 'sendgrid',
      name: 'SendGrid',
      type: 'email',
      apiKey: process.env.SENDGRID_API_KEY,
      settings: {
        defaultFrom: process.env.SENDGRID_FROM_EMAIL,
        templates: {
          welcome: 'd-welcome-template',
          newsletter: 'd-newsletter-template',
          promotion: 'd-promotion-template',
        },
      },
      isActive: !!process.env.SENDGRID_API_KEY,
    });

    this.integrations.set('onesignal', {
      id: 'onesignal',
      name: 'OneSignal',
      type: 'push',
      apiKey: process.env.ONESIGNAL_API_KEY,
      settings: {
        appId: process.env.ONESIGNAL_APP_ID,
        defaultIcon: process.env.ONESIGNAL_DEFAULT_ICON,
      },
      isActive: !!process.env.ONESIGNAL_API_KEY,
    });

    this.integrations.set('twilio', {
      id: 'twilio',
      name: 'Twilio',
      type: 'sms',
      apiKey: process.env.TWILIO_API_KEY,
      settings: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM_NUMBER,
      },
      isActive: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    });

    this.integrations.set('google_analytics', {
      id: 'google_analytics',
      name: 'Google Analytics',
      type: 'analytics',
      settings: {
        measurementId: process.env.GA_MEASUREMENT_ID,
        apiSecret: process.env.GA_API_SECRET,
      },
      isActive: !!process.env.GA_MEASUREMENT_ID,
    });

    this.integrations.set('webhook', {
      id: 'webhook',
      name: 'Custom Webhook',
      type: 'webhook',
      webhookUrl: process.env.CDP_WEBHOOK_URL,
      settings: {
        timeout: 30000,
        retries: 3,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CDP_WEBHOOK_AUTH_TOKEN}`,
        },
      },
      isActive: !!process.env.CDP_WEBHOOK_URL,
    });
  }

  async activateSegment(segmentId: string, integrationId: string, users: any[]): Promise<ActivationResult> {
    const integration = this.integrations.get(integrationId);
    
    if (!integration) {
      return {
        integration: integrationId,
        status: 'failed',
        message: `Integration not found: ${integrationId}`,
      };
    }

    if (!integration.isActive) {
      return {
        integration: integrationId,
        status: 'failed',
        message: `Integration is not active: ${integrationId}`,
      };
    }

    this.logger.log(`Activating segment ${segmentId} for integration ${integrationId} with ${users.length} users`);

    try {
      let activatedUsers = 0;
      let failedUsers = 0;

      switch (integration.type) {
        case 'email':
          const emailResult = await this.activateEmailSegment(integration, segmentId, users);
          activatedUsers = emailResult.success;
          failedUsers = emailResult.failed;
          break;

        case 'push':
          const pushResult = await this.activatePushSegment(integration, segmentId, users);
          activatedUsers = pushResult.success;
          failedUsers = pushResult.failed;
          break;

        case 'sms':
          const smsResult = await this.activateSmsSegment(integration, segmentId, users);
          activatedUsers = smsResult.success;
          failedUsers = smsResult.failed;
          break;

        case 'webhook':
          const webhookResult = await this.activateWebhookSegment(integration, segmentId, users);
          activatedUsers = webhookResult.success;
          failedUsers = webhookResult.failed;
          break;

        case 'analytics':
          const analyticsResult = await this.activateAnalyticsSegment(integration, segmentId, users);
          activatedUsers = analyticsResult.success;
          failedUsers = analyticsResult.failed;
          break;

        default:
          return {
            integration: integrationId,
            status: 'failed',
            message: `Unsupported integration type: ${integration.type}`,
          };
      }

      return {
        integration: integrationId,
        status: 'success',
        message: `Successfully activated segment for ${activatedUsers} users`,
        activatedUsers,
        failedUsers,
      };

    } catch (error) {
      this.logger.error(`Failed to activate segment ${segmentId} for integration ${integrationId}: ${error.message}`);
      
      return {
        integration: integrationId,
        status: 'failed',
        message: error.message,
      };
    }
  }

  private async activateEmailSegment(integration: IntegrationConfig, segmentId: string, users: any[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Get segment details
    const segment = await this.prisma.cdpSegment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      throw new Error(`Segment not found: ${segmentId}`);
    }

    for (const user of users) {
      try {
        // Check user consent for marketing emails
        const hasConsent = await this.checkUserConsent(user.id, 'marketing', 'email');
        if (!hasConsent) {
          failed++;
          continue;
        }

        // Send email using SendGrid
        await this.sendEmail(integration, user.email, {
          templateId: integration.settings.templates.newsletter,
          dynamicData: {
            segmentName: segment.name,
            userName: user.name || user.email,
            segmentDescription: segment.description,
          },
        });

        success++;
      } catch (error) {
        this.logger.error(`Failed to send email to user ${user.id}: ${error.message}`);
        failed++;
      }
    }

    return { success, failed };
  }

  private async activatePushSegment(integration: IntegrationConfig, segmentId: string, users: any[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const user of users) {
      try {
        // Check user consent for push notifications
        const hasConsent = await this.checkUserConsent(user.id, 'marketing', 'push');
        if (!hasConsent) {
          failed++;
          continue;
        }

        // Send push notification using OneSignal
        await this.sendPushNotification(integration, user.id, {
          title: 'New Segment Update',
          message: `You've been added to segment ${segmentId}`,
          data: { segmentId },
        });

        success++;
      } catch (error) {
        this.logger.error(`Failed to send push notification to user ${user.id}: ${error.message}`);
        failed++;
      }
    }

    return { success, failed };
  }

  private async activateSmsSegment(integration: IntegrationConfig, segmentId: string, users: any[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const user of users) {
      try {
        // Check user consent for SMS
        const hasConsent = await this.checkUserConsent(user.id, 'marketing', 'sms');
        if (!hasConsent) {
          failed++;
          continue;
        }

        // Send SMS using Twilio
        await this.sendSms(integration, user.phoneNumber, {
          body: `You've been added to segment ${segmentId}. Reply STOP to unsubscribe.`,
        });

        success++;
      } catch (error) {
        this.logger.error(`Failed to send SMS to user ${user.id}: ${error.message}`);
        failed++;
      }
    }

    return { success, failed };
  }

  private async activateWebhookSegment(integration: IntegrationConfig, segmentId: string, users: any[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Send batch webhook with all users
    try {
      await this.sendWebhook(integration, {
        event: 'segment_activated',
        segmentId,
        users: users.map(user => ({
          id: user.id,
          email: user.email,
          phone: user.phoneNumber,
          walletAddress: user.walletAddress,
        })),
        timestamp: new Date().toISOString(),
      });

      success = users.length;
    } catch (error) {
      this.logger.error(`Failed to send webhook for segment ${segmentId}: ${error.message}`);
      failed = users.length;
    }

    return { success, failed };
  }

  private async activateAnalyticsSegment(integration: IntegrationConfig, segmentId: string, users: any[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Send user list to Google Analytics as custom audience
    try {
      await this.sendToGoogleAnalytics(integration, {
        segmentId,
        users: users.map(user => user.id),
      });

      success = users.length;
    } catch (error) {
      this.logger.error(`Failed to send segment to Google Analytics: ${error.message}`);
      failed = users.length;
    }

    return { success, failed };
  }

  private async checkUserConsent(userId: string, consentType: string, channel: string): Promise<boolean> {
    const consent = await this.prisma.cdpConsent.findFirst({
      where: {
        userId,
        type: consentType.toUpperCase(),
        channel,
        granted: true,
      },
    });

    return !!consent;
  }

  private async sendEmail(integration: IntegrationConfig, to: string, data: any): Promise<void> {
    // This would use SendGrid SDK to send email
    this.logger.log(`Sending email to ${to} using template ${data.templateId}`);
    
    // Mock implementation - in production, use actual SendGrid SDK
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendPushNotification(integration: IntegrationConfig, userId: string, data: any): Promise<void> {
    // This would use OneSignal SDK to send push notification
    this.logger.log(`Sending push notification to user ${userId}`);
    
    // Mock implementation - in production, use actual OneSignal SDK
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendSms(integration: IntegrationConfig, to: string, data: any): Promise<void> {
    // This would use Twilio SDK to send SMS
    this.logger.log(`Sending SMS to ${to}`);
    
    // Mock implementation - in production, use actual Twilio SDK
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendWebhook(integration: IntegrationConfig, data: any): Promise<void> {
    // This would send HTTP request to webhook URL
    this.logger.log(`Sending webhook to ${integration.webhookUrl}`);
    
    // Mock implementation - in production, use actual HTTP client
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendToGoogleAnalytics(integration: IntegrationConfig, data: any): Promise<void> {
    // This would send data to Google Analytics API
    this.logger.log(`Sending segment data to Google Analytics`);
    
    // Mock implementation - in production, use actual GA API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async notifyConsentChange(userId: string, consentData: any): Promise<void> {
    // Notify all active integrations about consent changes
    for (const [integrationId, integration] of this.integrations) {
      if (!integration.isActive) continue;

      try {
        switch (integration.type) {
          case 'webhook':
            await this.sendWebhook(integration, {
              event: 'consent_updated',
              userId,
              consentData,
              timestamp: new Date().toISOString(),
            });
            break;

          case 'analytics':
            await this.sendToGoogleAnalytics(integration, {
              event: 'consent_updated',
              userId,
              consentData,
            });
            break;
        }
      } catch (error) {
        this.logger.error(`Failed to notify ${integrationId} about consent change: ${error.message}`);
      }
    }
  }

  async getIntegrationStatus(): Promise<IntegrationConfig[]> {
    return Array.from(this.integrations.values());
  }

  async addCustomIntegration(config: Omit<IntegrationConfig, 'id'>): Promise<IntegrationConfig> {
    const id = `custom_${Date.now()}`;
    const integration: IntegrationConfig = { ...config, id };
    
    this.integrations.set(id, integration);
    
    this.logger.log(`Added custom integration: ${integration.name} (${id})`);
    
    return integration;
  }

  async updateIntegration(id: string, updates: Partial<IntegrationConfig>): Promise<IntegrationConfig | null> {
    const existing = this.integrations.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.integrations.set(id, updated);
    
    this.logger.log(`Updated integration: ${updated.name} (${id})`);
    
    return updated;
  }

  async removeIntegration(id: string): Promise<boolean> {
    const removed = this.integrations.delete(id);
    
    if (removed) {
      this.logger.log(`Removed integration: ${id}`);
    }
    
    return removed;
  }
}
