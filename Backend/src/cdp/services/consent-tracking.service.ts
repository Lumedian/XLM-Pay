import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ConsentUpdateDto, ConsentType } from '../dto/cdp.dto';

export interface UserConsent {
  [key: string]: boolean;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  type: ConsentType;
  granted: boolean;
  channel?: string;
  purpose?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ConsentTrackingService {
  private readonly logger = new Logger(ConsentTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async updateConsent(userId: string, consentDto: ConsentUpdateDto): Promise<ConsentRecord> {
    this.logger.log(`Updating consent for user ${userId}: ${consentDto.type} = ${consentDto.granted}`);

    // Check if consent record already exists
    const existing = await this.prisma.cdpConsent.findFirst({
      where: {
        userId,
        type: consentDto.type,
        channel: consentDto.channel,
      },
    });

    let consent: any;

    if (existing) {
      // Update existing record
      consent = await this.prisma.cdpConsent.update({
        where: { id: existing.id },
        data: {
          granted: consentDto.granted,
          purpose: consentDto.purpose,
          ipAddress: consentDto.ipAddress,
          userAgent: consentDto.userAgent,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new record
      consent = await this.prisma.cdpConsent.create({
        data: {
          userId,
          type: consentDto.type,
          granted: consentDto.granted,
          channel: consentDto.channel,
          purpose: consentDto.purpose,
          ipAddress: consentDto.ipAddress,
          userAgent: consentDto.userAgent,
        },
      });
    }

    // Invalidate cache
    await this.invalidateUserConsentCache(userId);

    // Log consent change for audit
    await this.logConsentChange(userId, consentDto, existing?.granted);

    return {
      id: consent.id,
      userId: consent.userId,
      type: consent.type as ConsentType,
      granted: consent.granted,
      channel: consent.channel,
      purpose: consent.purpose,
      ipAddress: consent.ipAddress,
      userAgent: consent.userAgent,
      createdAt: consent.createdAt,
      updatedAt: consent.updatedAt,
    };
  }

  async getUserConsent(userId: string): Promise<UserConsent> {
    // Try cache first
    const cacheKey = `cdp:consent:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Get all consent records for user
    const consents = await this.prisma.cdpConsent.findMany({
      where: { userId },
    });

    // Build consent object
    const userConsent: UserConsent = {};
    
    // Default to false for all consent types
    Object.values(ConsentType).forEach(type => {
      userConsent[type] = false;
    });

    // Set actual consent values
    consents.forEach(consent => {
      const key = consent.channel ? `${consent.type}_${consent.channel}` : consent.type;
      userConsent[key] = consent.granted;
    });

    // Cache for 30 minutes
    await this.redis.setex(cacheKey, 1800, JSON.stringify(userConsent));

    return userConsent;
  }

  async hasConsent(userId: string, consentType: ConsentType, channel?: string): Promise<boolean> {
    const userConsent = await this.getUserConsent(userId);
    const key = channel ? `${consentType}_${channel}` : consentType;
    return userConsent[key] || false;
  }

  async getConsentHistory(userId: string, consentType?: ConsentType): Promise<ConsentRecord[]> {
    const whereClause: any = { userId };
    
    if (consentType) {
      whereClause.type = consentType;
    }

    const consents = await this.prisma.cdpConsent.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    return consents.map(consent => ({
      id: consent.id,
      userId: consent.userId,
      type: consent.type as ConsentType,
      granted: consent.granted,
      channel: consent.channel,
      purpose: consent.purpose,
      ipAddress: consent.ipAddress,
      userAgent: consent.userAgent,
      createdAt: consent.createdAt,
      updatedAt: consent.updatedAt,
    }));
  }

  async revokeAllConsent(userId: string, reason?: string): Promise<void> {
    this.logger.log(`Revoking all consent for user ${userId}${reason ? ` - ${reason}` : ''}`);

    await this.prisma.cdpConsent.updateMany({
      where: { userId },
      data: { granted: false, updatedAt: new Date() },
    });

    // Invalidate cache
    await this.invalidateUserConsentCache(userId);

    // Log for audit
    await this.logConsentChange(userId, { type: 'ALL', granted: false } as any, true, reason);
  }

  async exportUserConsentData(userId: string): Promise<any> {
    const consents = await this.getConsentHistory(userId);
    
    return {
      userId,
      exportDate: new Date().toISOString(),
      consents: consents.map(consent => ({
        type: consent.type,
        channel: consent.channel,
        granted: consent.granted,
        purpose: consent.purpose,
        createdAt: consent.createdAt.toISOString(),
        updatedAt: consent.updatedAt.toISOString(),
      })),
    };
  }

  async deleteConsentData(userId: string): Promise<void> {
    this.logger.log(`Deleting consent data for user ${userId}`);

    await this.prisma.cdpConsent.deleteMany({
      where: { userId },
    });

    // Invalidate cache
    await this.invalidateUserConsentCache(userId);
  }

  private async invalidateUserConsentCache(userId: string) {
    const cacheKey = `cdp:consent:${userId}`;
    await this.redis.del(cacheKey);
  }

  private async logConsentChange(
    userId: string,
    consentDto: ConsentUpdateDto,
    previousValue?: boolean,
    reason?: string,
  ) {
    // In a real implementation, this would log to an audit system
    this.logger.log(`Consent change for user ${userId}: ${consentDto.type} changed from ${previousValue} to ${consentDto.granted}${reason ? ` - ${reason}` : ''}`);
    
    // Store in audit log (simplified)
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CONSENT_UPDATE',
        entityType: 'CDP_CONSENT',
        entityId: userId,
        oldValue: previousValue,
        newValue: consentDto.granted,
        metadata: {
          consentType: consentDto.type,
          channel: consentDto.channel,
          purpose: consentDto.purpose,
          ipAddress: consentDto.ipAddress,
          userAgent: consentDto.userAgent,
          reason,
        },
      },
    }).catch(error => {
      this.logger.error(`Failed to log consent change: ${error.message}`);
    });
  }

  async getConsentStats(tenantId?: string): Promise<any> {
    const whereClause: any = {};
    
    if (tenantId) {
      whereClause.user = { tenantId };
    }

    const stats = await this.prisma.cdpConsent.groupBy({
      by: ['type', 'granted'],
      where: whereClause,
      _count: { id: true },
    });

    const result: any = {};
    
    stats.forEach(stat => {
      if (!result[stat.type]) {
        result[stat.type] = { granted: 0, denied: 0 };
      }
      
      if (stat.granted) {
        result[stat.type].granted = stat._count.id;
      } else {
        result[stat.type].denied = stat._count.id;
      }
    });

    return result;
  }

  async processGdprRequest(userId: string, requestType: 'export' | 'delete' | 'rectify'): Promise<any> {
    this.logger.log(`Processing GDPR request for user ${userId}: ${requestType}`);

    switch (requestType) {
      case 'export':
        return this.exportUserConsentData(userId);
      
      case 'delete':
        await this.deleteConsentData(userId);
        return { status: 'deleted', timestamp: new Date().toISOString() };
      
      case 'rectify':
        // This would allow users to correct their consent preferences
        const currentConsent = await this.getUserConsent(userId);
        return {
          status: 'ready_for_rectification',
          currentConsent,
          timestamp: new Date().toISOString(),
        };
      
      default:
        throw new Error(`Invalid GDPR request type: ${requestType}`);
    }
  }
}
