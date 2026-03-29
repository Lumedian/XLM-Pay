import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ProcessedEvent } from './event-ingestion.service';

export interface UnifiedProfile {
  id: string;
  email?: string;
  phoneNumber?: string;
  walletAddress?: string;
  profileData: Record<string, any>;
  eventCount: number;
  lastActivity?: Date;
  firstSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySource: Record<string, number>;
  mostActiveHour: number;
  mostActiveDay: number;
  averageEventsPerDay: number;
  daysActive: number;
  lastSeen: Date;
}

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getUnifiedProfile(userId: string): Promise<UnifiedProfile> {
    // Try cache first
    const cacheKey = `cdp:profile:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      const profile = JSON.parse(cached);
      return {
        ...profile,
        lastActivity: profile.lastActivity ? new Date(profile.lastActivity) : undefined,
        firstSeen: new Date(profile.firstSeen),
        createdAt: new Date(profile.createdAt),
        updatedAt: new Date(profile.updatedAt),
      };
    }

    // Get user from database
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get event count and last activity
    const eventStats = await this.prisma.cdpEvent.aggregate({
      where: { userId },
      _count: { id: true },
      _max: { timestamp: true },
      _min: { timestamp: true },
    });

    const profile: UnifiedProfile = {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      walletAddress: user.walletAddress,
      profileData: user.profileData || {},
      eventCount: eventStats._count.id,
      lastActivity: eventStats._max.timestamp,
      firstSeen: eventStats._min.timestamp || user.createdAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Cache for 30 minutes
    await this.redis.setex(cacheKey, 1800, JSON.stringify(profile));

    return profile;
  }

  async updateProfileFromEvent(event: ProcessedEvent) {
    if (!event.userId) return;

    const user = await this.prisma.user.findUnique({
      where: { id: event.userId },
    });

    if (!user) return;

    // Update profile data based on event
    const updatedProfileData = this.extractProfileDataFromEvent(user.profileData || {}, event);

    // Update last activity
    await this.prisma.user.update({
      where: { id: event.userId },
      data: {
        profileData: updatedProfileData,
        updatedAt: new Date(),
      },
    });

    // Invalidate cache
    const cacheKey = `cdp:profile:${event.userId}`;
    await this.redis.del(cacheKey);

    this.logger.log(`Updated profile for user ${event.userId} from event ${event.eventName}`);
  }

  private extractProfileDataFromEvent(
    currentProfileData: Record<string, any>,
    event: ProcessedEvent,
  ): Record<string, any> {
    const updatedData = { ...currentProfileData };

    // Extract relevant information from event properties
    const { properties } = event;

    // Update device information
    if (event.userAgent && !updatedData.device) {
      updatedData.device = this.parseUserAgent(event.userAgent);
    }

    // Update location information
    if (properties.location) {
      updatedData.location = properties.location;
    }

    // Update preferences
    if (properties.preferences) {
      updatedData.preferences = {
        ...updatedData.preferences,
        ...properties.preferences,
      };
    }

    // Update interests
    if (properties.interests) {
      updatedData.interests = [
        ...(updatedData.interests || []),
        ...(Array.isArray(properties.interests) ? properties.interests : [properties.interests]),
      ].filter((interest, index, arr) => arr.indexOf(interest) === index); // Remove duplicates
    }

    // Track first/last seen for specific features
    if (!updatedData.features) updatedData.features = {};
    
    const feature = this.extractFeatureFromEvent(event);
    if (feature) {
      if (!updatedData.features[feature]) {
        updatedData.features[feature] = {
          firstSeen: event.timestamp,
          lastSeen: event.timestamp,
          count: 1,
        };
      } else {
        updatedData.features[feature].lastSeen = event.timestamp;
        updatedData.features[feature].count += 1;
      }
    }

    return updatedData;
  }

  private parseUserAgent(userAgent: string): Record<string, any> {
    // Simple user agent parsing (in production, use a proper library)
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
    const isTablet = /iPad|Tablet/.test(userAgent);
    
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';

    return {
      userAgent,
      isMobile,
      isTablet,
      isDesktop: !isMobile && !isTablet,
      browser,
      os,
    };
  }

  private extractFeatureFromEvent(event: ProcessedEvent): string | null {
    // Extract feature name from event
    switch (event.eventName) {
      case 'page_view':
        return 'page_views';
      case 'click':
        return 'clicks';
      case 'form_submit':
        return 'forms';
      case 'purchase':
        return 'purchases';
      case 'login':
        return 'logins';
      case 'signup':
        return 'signups';
      default:
        return event.eventName.includes('_') ? event.eventName.split('_')[0] : event.eventName;
    }
  }

  async getProfileMetrics(userId: string, timeRange: '24h' | '7d' | '30d' = '7d'): Promise<ProfileMetrics> {
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

    // Get events in time range
    const events = await this.prisma.cdpEvent.findMany({
      where: {
        userId,
        timestamp: { gte: startTime },
      },
      select: {
        type: true,
        source: true,
        timestamp: true,
      },
    });

    // Calculate metrics
    const eventsByType: Record<string, number> = {};
    const eventsBySource: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};
    const dayCounts: Record<number, number> = {};
    const activeDays = new Set<number>();

    events.forEach(event => {
      // Count by type
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      
      // Count by source
      eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
      
      // Count by hour
      const hour = event.timestamp.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      
      // Count by day of week
      const day = event.timestamp.getDay();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
      
      // Track active days
      const dayOfYear = Math.floor((event.timestamp.getTime() - new Date(event.timestamp.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
      activeDays.add(dayOfYear);
    });

    // Find most active hour and day
    const mostActiveHour = Object.entries(hourCounts).reduce((a, b) => 
      hourCounts[a[0]] > hourCounts[b[0]] ? a : b, ['0', 0])[0];
    
    const mostActiveDay = Object.entries(dayCounts).reduce((a, b) => 
      dayCounts[a[0]] > dayCounts[b[0]] ? a : b, ['0', 0])[0];

    const daysDiff = Math.ceil((now.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24));
    const averageEventsPerDay = events.length / Math.max(daysDiff, 1);

    return {
      totalEvents: events.length,
      eventsByType,
      eventsBySource,
      mostActiveHour: parseInt(mostActiveHour),
      mostActiveDay: parseInt(mostActiveDay),
      averageEventsPerDay,
      daysActive: activeDays.size,
      lastSeen: events.length > 0 ? events[events.length - 1].timestamp : new Date(0),
    };
  }

  async searchProfiles(query: string, filters?: {
    eventCount?: { min?: number; max?: number };
    lastActivity?: { after?: Date; before?: Date };
    sources?: string[];
  }, limit: number = 50, offset: number = 0) {
    let whereClause: any = {
      OR: [
        { email: { contains: query, mode: 'insensitive' } },
        { phoneNumber: { contains: query } },
        { walletAddress: { contains: query, mode: 'insensitive' } },
        { profileData: { path: ['name'], string_contains: query } },
      ],
    };

    // Apply filters
    if (filters?.eventCount) {
      const eventCountSubquery = this.prisma.cdpEvent.groupBy({
        by: ['userId'],
        where: {
          userId: { not: null },
        },
        _count: { id: true },
      });

      // This is a simplified approach - in production you might need more complex filtering
    }

    const users = await this.prisma.user.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            events: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return users.map(user => ({
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      walletAddress: user.walletAddress,
      eventCount: user._count.events,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }

  async updateProfileData(userId: string, data: Record<string, any>) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const updatedProfileData = {
      ...(user.profileData || {}),
      ...data,
    };

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        profileData: updatedProfileData,
        updatedAt: new Date(),
      },
    });

    // Invalidate cache
    const cacheKey = `cdp:profile:${userId}`;
    await this.redis.del(cacheKey);

    return updatedProfileData;
  }
}
