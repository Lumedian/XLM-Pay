import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationService {
  async sendNotification(userId: string, notification: any): Promise<void> {
    // Temporary mock implementation
    console.log(`Notification sent to user ${userId}:`, notification);
  }
}
