import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './services/notification.service';
import { EmailService } from './services/email.service';
import { WebPushService } from './services/web-push.service';
import { DeadlineAlertTask } from './tasks/deadline-alert.task';
import { EmailRetryTask } from './tasks/email-retry.task';
import { DatabaseModule } from '../database.module';
import { TenancyModule } from '../tenancy/tenancy.module';

@Module({
  imports: [DatabaseModule, TenancyModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailService,
    WebPushService,
    DeadlineAlertTask,
    EmailRetryTask,
  ],
  exports: [NotificationService],
})
export class NotificationModule { }
