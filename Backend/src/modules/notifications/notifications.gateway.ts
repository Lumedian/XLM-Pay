import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@WebSocketGateway({
    cors: { origin: '*' },
    namespace: 'notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(NotificationsGateway.name);

    @WebSocketServer()
    server: Server;

    constructor(private readonly redis: RedisService) { }

    async handleConnection(client: Socket) {
        const userId = client.handshake.auth.userId;
        if (!userId) {
            client.disconnect();
            return;
        }

        this.logger.log(`User ${userId} connected to notifications namespace`);
        await this.redis.client.set(`user:${userId}:notification_socket`, client.id);
        client.join(`user:${userId}`);
    }

    async handleDisconnect(client: Socket) {
        const userId = client.handshake.auth.userId;
        if (userId) {
            this.logger.log(`User ${userId} disconnected from notifications namespace`);
            await this.redis.client.del(`user:${userId}:notification_socket`);
        }
    }

    async sendToUser(userId: string, event: string, payload: any) {
        this.logger.debug(`Sending ${event} to user ${userId}`);
        this.server.to(`user:${userId}`).emit(event, payload);
    }
}
