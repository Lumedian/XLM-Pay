import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { WebsocketService } from '../../websocket/websocket.service';
import { ProcessedEvent } from './event-ingestion.service';

export interface SegmentUpdate {
  userId: string;
  segmentId: string;
  action: 'added' | 'removed';
  timestamp: Date;
}

export interface EventUpdate {
  userId?: string;
  anonymousId?: string;
  event: ProcessedEvent;
  timestamp: Date;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly eventUpdateChannel = 'cdp:event-updates';
  private readonly segmentUpdateChannel = 'cdp:segment-updates';

  constructor(
    private readonly redis: RedisService,
    private readonly websocketService: WebsocketService,
  ) {
    this.setupRedisSubscriptions();
  }

  async broadcastEventUpdate(event: ProcessedEvent) {
    const update: EventUpdate = {
      userId: event.userId,
      anonymousId: event.anonymousId,
      event,
      timestamp: new Date(),
    };

    // Publish to Redis for other services
    await this.redis.publish(this.eventUpdateChannel, JSON.stringify(update));

    // Send via WebSocket to connected clients
    await this.sendEventUpdateToClients(update);

    this.logger.debug(`Broadcasted event update: ${event.eventName} for user ${event.userId || 'anonymous'}`);
  }

  async broadcastSegmentUpdates(updates: SegmentUpdate[]) {
    for (const update of updates) {
      // Publish to Redis
      await this.redis.publish(this.segmentUpdateChannel, JSON.stringify(update));

      // Send via WebSocket
      await this.sendSegmentUpdateToClients(update);

      this.logger.debug(`Broadcasted segment update: user ${update.userId} ${update.action} to segment ${update.segmentId}`);
    }
  }

  async broadcastUserProfileUpdate(userId: string, profileData: any) {
    const update = {
      type: 'profile_update',
      userId,
      profileData,
      timestamp: new Date(),
    };

    await this.redis.publish('cdp:profile-updates', JSON.stringify(update));
    await this.sendProfileUpdateToClients(update);
  }

  async broadcastConsentUpdate(userId: string, consentData: any) {
    const update = {
      type: 'consent_update',
      userId,
      consentData,
      timestamp: new Date(),
    };

    await this.redis.publish('cdp:consent-updates', JSON.stringify(update));
    await this.sendConsentUpdateToClients(update);
  }

  private async sendEventUpdateToClients(update: EventUpdate) {
    try {
      // Send to user-specific room if user is identified
      if (update.userId) {
        await this.websocketService.sendToRoom(`user:${update.userId}`, 'cdp_event_update', update);
      }

      // Send to admin room for monitoring
      await this.websocketService.sendToRoom('cdp_admins', 'cdp_event_update', update);

      // Send to tenant-specific room if tenant info is available
      if (update.event.tenantId) {
        await this.websocketService.sendToRoom(`tenant:${update.event.tenantId}`, 'cdp_event_update', update);
      }
    } catch (error) {
      this.logger.error(`Failed to send event update to WebSocket clients: ${error.message}`);
    }
  }

  private async sendSegmentUpdateToClients(update: SegmentUpdate) {
    try {
      // Send to user-specific room
      await this.websocketService.sendToRoom(`user:${update.userId}`, 'cdp_segment_update', update);

      // Send to admin room
      await this.websocketService.sendToRoom('cdp_admins', 'cdp_segment_update', update);

      // Send to segment-specific room
      await this.websocketService.sendToRoom(`segment:${update.segmentId}`, 'cdp_segment_update', update);
    } catch (error) {
      this.logger.error(`Failed to send segment update to WebSocket clients: ${error.message}`);
    }
  }

  private async sendProfileUpdateToClients(update: any) {
    try {
      await this.websocketService.sendToRoom(`user:${update.userId}`, 'cdp_profile_update', update);
      await this.websocketService.sendToRoom('cdp_admins', 'cdp_profile_update', update);
    } catch (error) {
      this.logger.error(`Failed to send profile update to WebSocket clients: ${error.message}`);
    }
  }

  private async sendConsentUpdateToClients(update: any) {
    try {
      await this.websocketService.sendToRoom(`user:${update.userId}`, 'cdp_consent_update', update);
      await this.websocketService.sendToRoom('cdp_admins', 'cdp_consent_update', update);
    } catch (error) {
      this.logger.error(`Failed to send consent update to WebSocket clients: ${error.message}`);
    }
  }

  private setupRedisSubscriptions() {
    // Subscribe to Redis channels for cross-service communication
    this.redis.subscribe(this.eventUpdateChannel, (message) => {
      try {
        const update: EventUpdate = JSON.parse(message);
        this.handleEventUpdate(update);
      } catch (error) {
        this.logger.error(`Failed to process event update from Redis: ${error.message}`);
      }
    });

    this.redis.subscribe(this.segmentUpdateChannel, (message) => {
      try {
        const update: SegmentUpdate = JSON.parse(message);
        this.handleSegmentUpdate(update);
      } catch (error) {
        this.logger.error(`Failed to process segment update from Redis: ${error.message}`);
      }
    });
  }

  private handleEventUpdate(update: EventUpdate) {
    // Handle real-time event updates from other services
    this.logger.debug(`Received event update from Redis: ${update.event.eventName}`);
    
    // Additional processing can be added here
    // For example: trigger real-time analytics, update dashboards, etc.
  }

  private handleSegmentUpdate(update: SegmentUpdate) {
    // Handle real-time segment updates from other services
    this.logger.debug(`Received segment update from Redis: user ${update.userId} ${update.action} segment ${update.segmentId}`);
    
    // Additional processing can be added here
    // For example: trigger marketing automation, update user scores, etc.
  }

  async subscribeToUserUpdates(userId: string, socketId: string) {
    // Add socket to user room for real-time updates
    await this.websocketService.addToRoom(socketId, `user:${userId}`);
    this.logger.debug(`Socket ${socketId} subscribed to user ${userId} updates`);
  }

  async subscribeToSegmentUpdates(segmentId: string, socketId: string) {
    // Add socket to segment room for real-time updates
    await this.websocketService.addToRoom(socketId, `segment:${segmentId}`);
    this.logger.debug(`Socket ${socketId} subscribed to segment ${segmentId} updates`);
  }

  async subscribeToAdminUpdates(socketId: string) {
    // Add socket to admin room for monitoring
    await this.websocketService.addToRoom(socketId, 'cdp_admins');
    this.logger.debug(`Socket ${socketId} subscribed to CDP admin updates`);
  }

  async unsubscribeFromUpdates(socketId: string, rooms: string[]) {
    for (const room of rooms) {
      await this.websocketService.removeFromRoom(socketId, room);
    }
    this.logger.debug(`Socket ${socketId} unsubscribed from updates: ${rooms.join(', ')}`);
  }

  async getRealTimeStats(): Promise<any> {
    // Get real-time statistics from Redis
    const stats = {
      activeConnections: await this.getActiveConnectionCount(),
      eventsPerMinute: await this.getEventsPerMinute(),
      segmentUpdatesPerMinute: await this.getSegmentUpdatesPerMinute(),
      topSegments: await this.getTopActiveSegments(),
      recentActivity: await this.getRecentActivity(),
    };

    return stats;
  }

  private async getActiveConnectionCount(): Promise<number> {
    try {
      const rooms = await this.websocketService.getRoomMembers('cdp_admins');
      return rooms.length;
    } catch (error) {
      return 0;
    }
  }

  private async getEventsPerMinute(): Promise<number> {
    const key = 'cdp:stats:events_per_minute';
    const count = await this.redis.get(key);
    return parseInt(count || '0', 10);
  }

  private async getSegmentUpdatesPerMinute(): Promise<number> {
    const key = 'cdp:stats:segment_updates_per_minute';
    const count = await this.redis.get(key);
    return parseInt(count || '0', 10);
  }

  private async getTopActiveSegments(): Promise<any[]> {
    const key = 'cdp:stats:top_segments';
    const cached = await this.redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }

    return [];
  }

  private async getRecentActivity(): Promise<any[]> {
    const key = 'cdp:stats:recent_activity';
    const cached = await this.redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }

    return [];
  }

  async updateStats(type: 'event' | 'segment_update') {
    const now = new Date();
    const minuteKey = `${now.getHours()}:${now.getMinutes()}`;
    
    if (type === 'event') {
      await this.redis.incr('cdp:stats:events_per_minute');
      await this.redis.expire('cdp:stats:events_per_minute', 120); // Keep for 2 minutes
    } else {
      await this.redis.incr('cdp:stats:segment_updates_per_minute');
      await this.redis.expire('cdp:stats:segment_updates_per_minute', 120);
    }

    // Reset counters every minute
    const lastReset = await this.redis.get('cdp:stats:last_reset');
    if (!lastReset || parseInt(lastReset, 10) < now.getTime() - 60000) {
      await this.redis.del('cdp:stats:events_per_minute');
      await this.redis.del('cdp:stats:segment_updates_per_minute');
      await this.redis.set('cdp:stats:last_reset', now.getTime().toString());
    }
  }
}
