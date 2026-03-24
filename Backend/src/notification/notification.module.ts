import { DatabaseModule } from '../database.module';
import { DeadlineAlertTask } from './tasks/deadline-alert.task';
import { EmailRetryTask } from './tasks/email-retry.task';
import { EmailService } from './services/email.service';
import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './services/notification.service';
import { SmsService } from './services/sms.service';
import { TemplateService } from './services/template.service';
import { WebPushService } from './services/web-push.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailService,
    WebPushService,
    SmsService,
    TemplateService,
    NotificationGateway,
    DeadlineAlertTask,
    EmailRetryTask,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
