import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailProvider {
    private readonly logger = new Logger(EmailProvider.name);

    async send(userId: string, type: string, data: any, options: any) {
        this.logger.log(`[MOCK EMAIL] Sending ${type} to user ${userId}`);
        this.logger.debug(`Data: ${JSON.stringify(data)}`);
        // In a real implementation, you'd use a service like SendGrid, SES, or a local SMTP server.
        return { success: true, messageId: `mock-email-${Date.now()}` };
    }
}
