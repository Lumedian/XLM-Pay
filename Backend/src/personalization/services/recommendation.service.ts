import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import { UserEvent, UserEventType } from '../entities/user-event.entity';

type Recommendation = { itemId: string; score: number; reasons: string[] };

@Injectable()
export class RecommendationService {
  constructor(
    @InjectRepository(UserEvent)
    private readonly eventRepo: Repository<UserEvent>,
  ) {}

  async getRecommendations(params: {
    userId?: string | null;
    tenantId?: string | null;
    limit?: number;
    days?: number;
  }): Promise<Recommendation[]> {
    const limit = params.limit ?? 10;
    const days = params.days ?? 30;
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

    const where: any = { timestamp: Between(start, end) };
    if (params.userId === null) {
      where.userId = IsNull();
    } else if (typeof params.userId === 'string') {
      where.userId = params.userId;
    }
    const recent = await this.eventRepo.find({
      where,
      order: { timestamp: 'DESC' },
      take: 500,
    });

    const recentItems = recent
      .filter(
        (e) =>
          e.itemId &&
          [
            UserEventType.VIEW,
            UserEventType.CLICK,
            UserEventType.LIKE,
            UserEventType.PURCHASE,
          ].includes(e.eventType),
      )
      .map((e) => e.itemId as string);

    const itemSet = new Set(recentItems);
    const candidates = new Map<string, { score: number; reasons: string[] }>();

    if (recentItems.length > 0) {
      const sessions = Array.from(
        new Set(recent.map((e) => e.sessionId).filter(Boolean)),
      ) as string[];
      if (sessions.length > 0) {
        const qb = this.eventRepo
          .createQueryBuilder('e')
          .select(['e.sessionId AS sessionId', 'e.itemId AS itemId'])
          .where('e.timestamp BETWEEN :start AND :end', { start, end })
          .andWhere('e.sessionId IN (:...sessions)', { sessions })
          .andWhere('e.itemId IS NOT NULL');
        if (params.tenantId) {
          qb.andWhere('e.tenantId = :tenantId', { tenantId: params.tenantId });
        }
        const rows = await qb.getRawMany<{
          sessionId: string;
          itemId: string;
        }>();
        const bySession = new Map<string, string[]>();
        for (const r of rows) {
          if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, []);
          bySession.get(r.sessionId)!.push(r.itemId);
        }
        for (const items of bySession.values()) {
          const unique = Array.from(new Set(items));
          for (const a of unique) {
            for (const b of unique) {
              if (a === b) continue;
              if (itemSet.has(a) && !itemSet.has(b)) {
                const c = candidates.get(b) ?? { score: 0, reasons: [] };
                c.score += 1;
                c.reasons.push(`co_view_with_${a}`);
                candidates.set(b, c);
              }
            }
          }
        }
      }
    }

    const trending = await this.eventRepo
      .createQueryBuilder('e')
      .select(['e.itemId AS itemId'])
      .addSelect('COUNT(*)', 'c')
      .where('e.timestamp BETWEEN :start AND :end', { start, end })
      .andWhere('e.itemId IS NOT NULL')
      .groupBy('e.itemId')
      .orderBy('c', 'DESC')
      .limit(50)
      .getRawMany<{ itemId: string; c: string }>();

    for (const row of trending) {
      const itemId = row.itemId;
      if (!itemId) continue;
      if (itemSet.has(itemId)) continue;
      const c = candidates.get(itemId) ?? { score: 0, reasons: [] };
      c.score += 0.1 * parseInt(row.c, 10);
      c.reasons.push('trending');
      candidates.set(itemId, c);
    }

    const out: Recommendation[] = Array.from(candidates.entries())
      .map(([itemId, v]) => ({
        itemId,
        score: v.score,
        reasons: v.reasons.slice(0, 3),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return out;
  }
}
