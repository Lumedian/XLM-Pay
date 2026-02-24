import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PushProvider {
    private readonly logger = new Logger(PushProvider.name);

    async send(userId: string, type: string, data: any, options: any) {
        this.logger.log(`[MOCK PUSH] Sending ${type} to user ${userId}`);
        this.logger.debug(`Data: ${JSON.stringify(data)}`);
        // In a real implementation, you'd use a service like Firebase Cloud Messaging (FCM) or OneSignal.
        return { success: true, messageId: `mock-push-${Date.now()}` };
    }
}
