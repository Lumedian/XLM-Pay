import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EventIngestionDto, EventType, EventSource } from '../dto/cdp.dto';

export interface ProcessedEvent {
  id: string;
  userId?: string;
  anonymousId?: string;
  type: EventType;
  source: EventSource;
  eventName: string;
  properties: Record<string, any>;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  tenantId?: string;
  timestamp: Date;
  processedAt: Date;
}

@Injectable()
export class EventIngestionService {
  private readonly logger = new Logger(EventIngestionService.name);
  private readonly eventQueue = 'cdp:events:queue';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async processEvent(eventDto: EventIngestionDto): Promise<ProcessedEvent> {
    const timestamp = new Date(eventDto.timestamp || Date.now());
    
    // Store event in database
    const event = await this.prisma.cdpEvent.create({
      data: {
        anonymousId: eventDto.anonymousId,
        userId: eventDto.userId,
        type: eventDto.type,
        source: eventDto.source,
        eventName: eventDto.eventName,
        properties: eventDto.properties,
        sessionId: eventDto.sessionId,
        ipAddress: eventDto.ipAddress,
        userAgent: eventDto.userAgent,
        referrer: eventDto.referrer,
        tenantId: eventDto.tenantId,
        timestamp,
      },
    });

    // Cache event for real-time processing
    await this.cacheEvent(event);

    // Enqueue for background processing
    await this.enqueueEvent(event);

    this.logger.log(`Processed event ${event.id}: ${event.eventName}`);

    return {
      id: event.id,
      userId: event.userId,
      anonymousId: event.anonymousId,
      type: event.type as EventType,
      source: event.source as EventSource,
      eventName: event.eventName,
      properties: event.properties,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      referrer: event.referrer,
      tenantId: event.tenantId,
      timestamp: event.timestamp,
      processedAt: new Date(),
    };
  }

  private async cacheEvent(event: any) {
    const cacheKey = `cdp:event:${event.id}`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify(event)); // Cache for 1 hour
  }

  private async enqueueEvent(event: any) {
    await this.redis.lpush(this.eventQueue, JSON.stringify(event));
  }

  async getEventById(eventId: string): Promise<ProcessedEvent | null> {
    // Try cache first
    const cacheKey = `cdp:event:${eventId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      const event = JSON.parse(cached);
      return {
        id: event.id,
        userId: event.userId,
        anonymousId: event.anonymousId,
        type: event.type,
        source: event.source,
        eventName: event.eventName,
        properties: event.properties,
        sessionId: event.sessionId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        referrer: event.referrer,
        tenantId: event.tenantId,
        timestamp: new Date(event.timestamp),
        processedAt: new Date(event.processedAt),
      };
    }

    // Fallback to database
    const event = await this.prisma.cdpEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) return null;

    return {
      id: event.id,
      userId: event.userId,
      anonymousId: event.anonymousId,
      type: event.type as EventType,
      source: event.source as EventSource,
      eventName: event.eventName,
      properties: event.properties,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      referrer: event.referrer,
      tenantId: event.tenantId,
      timestamp: event.timestamp,
      processedAt: event.createdAt,
    };
  }

  async getUserEvents(userId: string, limit: number = 100, offset: number = 0) {
    return this.prisma.cdpEvent.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getAnonymousEvents(anonymousId: string, limit: number = 100, offset: number = 0) {
    return this.prisma.cdpEvent.findMany({
      where: { anonymousId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getEventStats(userId: string, timeRange: '24h' | '7d' | '30d' = '7d') {
    const now = new Date();
    let startTime: Date;

    switch (timeRange) {
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const stats = await this.prisma.cdpEvent.groupBy({
      by: ['type', 'eventName'],
      where: {
        userId,
        timestamp: {
          gte: startTime,
        },
      },
      _count: {
        id: true,
      },
    });

    return stats.map(stat => ({
      type: stat.type,
      eventName: stat.eventName,
      count: stat._count.id,
    }));
  }
}
