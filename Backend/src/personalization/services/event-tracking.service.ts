import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UserEvent, UserEventType } from '../entities/user-event.entity';

@Injectable()
export class EventTrackingService {
  constructor(
    @InjectRepository(UserEvent)
    private readonly eventRepo: Repository<UserEvent>,
  ) {}

  async recordEvent(input: {
    tenantId?: string | null;
    userId?: string | null;
    eventType: UserEventType;
    itemId?: string | null;
    sessionId?: string | null;
    page?: string | null;
    experimentId?: string | null;
    variant?: string | null;
    metadata?: Record<string, any> | null;
  }): Promise<UserEvent> {
    const event = this.eventRepo.create({
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      eventType: input.eventType,
      itemId: input.itemId ?? null,
      sessionId: input.sessionId ?? null,
      page: input.page ?? null,
      experimentId: input.experimentId ?? null,
      variant: input.variant ?? null,
      metadata: input.metadata ?? null,
    });
    return this.eventRepo.save(event);
  }

  async getUserEvents(userId: string, days = 30): Promise<UserEvent[]> {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    return this.eventRepo.find({
      where: { userId, timestamp: Between(start, end) },
      order: { timestamp: 'DESC' },
      take: 1000,
    });
  }

  async aggregateEvents(
    tenantId: string | null,
    start: Date,
    end: Date,
    groupBy: 'eventType' | 'itemId',
  ): Promise<Record<string, number>> {
    const qb = this.eventRepo
      .createQueryBuilder('e')
      .select(`e.${groupBy}`, 'key')
      .addSelect('COUNT(*)', 'value')
      .where('e.timestamp BETWEEN :start AND :end', { start, end });
    if (tenantId) {
      qb.andWhere('e.tenantId = :tenantId', { tenantId });
    }
    qb.groupBy(`e.${groupBy}`);
    const rows = await qb.getRawMany<{ key: string; value: string }>();
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (r.key) out[r.key] = parseInt(r.value, 10);
    }
    return out;
  }
}
