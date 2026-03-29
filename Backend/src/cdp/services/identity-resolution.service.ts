import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface ResolvedIdentity {
  userId?: string;
  anonymousId: string;
  isNewUser: boolean;
  confidence: number;
}

export interface IdentityMatch {
  userId: string;
  anonymousId: string;
  matchType: 'email' | 'phone' | 'wallet' | 'session' | 'fingerprint';
  confidence: number;
  createdAt: Date;
}

@Injectable()
export class IdentityResolutionService {
  private readonly logger = new Logger(IdentityResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async resolveIdentity(
    anonymousId?: string,
    userId?: string,
    tenantId?: string,
  ): Promise<ResolvedIdentity> {
    // If userId is provided, this is a known user
    if (userId) {
      // Check if this anonymous ID should be merged with the known user
      if (anonymousId) {
        await this.mergeAnonymousIdentity(anonymousId, userId, tenantId);
      }
      
      return {
        userId,
        anonymousId: anonymousId || await this.getOrCreateAnonymousId(userId),
        isNewUser: false,
        confidence: 1.0,
      };
    }

    // If only anonymousId, try to resolve to known user
    if (anonymousId) {
      const resolved = await this.resolveAnonymousToKnown(anonymousId, tenantId);
      if (resolved.userId) {
        return resolved;
      }
    }

    // Create new anonymous identity
    const newAnonymousId = anonymousId || this.generateAnonymousId();
    return {
      anonymousId: newAnonymousId,
      isNewUser: true,
      confidence: 0.5,
    };
  }

  async resolveAnonymousIdentity(anonymousId: string): Promise<ResolvedIdentity> {
    const resolved = await this.resolveAnonymousToKnown(anonymousId);
    
    return resolved || {
      anonymousId,
      isNewUser: false,
      confidence: 0.5,
    };
  }

  private async resolveAnonymousToKnown(
    anonymousId: string,
    tenantId?: string,
  ): Promise<ResolvedIdentity | null> {
    // Check cache first
    const cacheKey = `cdp:identity:${anonymousId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      const identity = JSON.parse(cached);
      if (identity.userId) {
        return {
          userId: identity.userId,
          anonymousId,
          isNewUser: false,
          confidence: identity.confidence,
        };
      }
    }

    // Look for identity matches in the database
    const matches = await this.prisma.cdpIdentityMatch.findMany({
      where: { anonymousId },
      orderBy: { confidence: 'desc' },
      take: 5,
    });

    if (matches.length === 0) {
      return null;
    }

    // Use the highest confidence match
    const bestMatch = matches[0];
    
    // Cache the result
    await this.redis.setex(cacheKey, 3600, JSON.stringify({
      userId: bestMatch.userId,
      confidence: bestMatch.confidence,
    }));

    return {
      userId: bestMatch.userId,
      anonymousId,
      isNewUser: false,
      confidence: bestMatch.confidence,
    };
  }

  private async mergeAnonymousIdentity(
    anonymousId: string,
    userId: string,
    tenantId?: string,
  ) {
    this.logger.log(`Merging anonymous identity ${anonymousId} with user ${userId}`);

    // Create identity match record
    await this.prisma.cdpIdentityMatch.create({
      data: {
        anonymousId,
        userId,
        matchType: 'session',
        confidence: 0.9,
        tenantId,
      },
    });

    // Update all events from this anonymous ID to have the userId
    await this.prisma.cdpEvent.updateMany({
      where: { anonymousId, userId: null },
      data: { userId },
    });

    // Update cache
    const cacheKey = `cdp:identity:${anonymousId}`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify({
      userId,
      confidence: 0.9,
    }));

    // Trigger segment re-evaluation for this user
    this.queueSegmentReevaluation(userId);
  }

  async createIdentityMatch(
    anonymousId: string,
    userId: string,
    matchType: 'email' | 'phone' | 'wallet' | 'session' | 'fingerprint',
    confidence: number,
    tenantId?: string,
  ) {
    // Check if match already exists
    const existing = await this.prisma.cdpIdentityMatch.findFirst({
      where: {
        anonymousId,
        userId,
        matchType,
      },
    });

    if (existing) {
      // Update confidence if higher
      if (confidence > existing.confidence) {
        await this.prisma.cdpIdentityMatch.update({
          where: { id: existing.id },
          data: { confidence },
        });
      }
      return existing;
    }

    // Create new match
    const match = await this.prisma.cdpIdentityMatch.create({
      data: {
        anonymousId,
        userId,
        matchType,
        confidence,
        tenantId,
      },
    });

    // Update events if this is a high-confidence match
    if (confidence >= 0.8) {
      await this.prisma.cdpEvent.updateMany({
        where: { anonymousId, userId: null },
        data: { userId },
      });
    }

    // Update cache
    const cacheKey = `cdp:identity:${anonymousId}`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify({
      userId,
      confidence,
    }));

    return match;
  }

  private async getOrCreateAnonymousId(userId: string): Promise<string> {
    // Check if user already has an anonymous ID
    const existingMatch = await this.prisma.cdpIdentityMatch.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existingMatch) {
      return existingMatch.anonymousId;
    }

    // Create new anonymous ID for this user
    const anonymousId = this.generateAnonymousId();
    await this.prisma.cdpIdentityMatch.create({
      data: {
        anonymousId,
        userId,
        matchType: 'session',
        confidence: 1.0,
      },
    });

    return anonymousId;
  }

  private generateAnonymousId(): string {
    return `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private queueSegmentReevaluation(userId: string) {
    // Add to segment evaluation queue
    this.redis.lpush('cdp:segments:reevaluate', JSON.stringify({
      userId,
      timestamp: new Date().toISOString(),
    }));
  }

  async getUserIdentityMatches(userId: string): Promise<IdentityMatch[]> {
    return this.prisma.cdpIdentityMatch.findMany({
      where: { userId },
      orderBy: { confidence: 'desc' },
    });
  }

  async getAnonymousIdentityMatches(anonymousId: string): Promise<IdentityMatch[]> {
    return this.prisma.cdpIdentityMatch.findMany({
      where: { anonymousId },
      orderBy: { confidence: 'desc' },
    });
  }
}
