import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SegmentCreateDto, SegmentType } from '../dto/cdp.dto';

export interface Segment {
  id: string;
  name: string;
  description?: string;
  type: SegmentType;
  sqlQuery?: string;
  visualConfig?: Record<string, any>;
  conditions?: Array<{
    field: string;
    operator: string;
    value: any;
    logicalOperator?: 'AND' | 'OR';
  }>;
  tenantId?: string;
  isActive: boolean;
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SegmentEvaluationResult {
  segmentId: string;
  totalUsers: number;
  addedUsers: string[];
  removedUsers: string[];
  updates: Array<{
    userId: string;
    segmentId: string;
    action: 'added' | 'removed';
  }>;
}

export interface UserSegment {
  id: string;
  name: string;
  type: string;
  joinedAt: Date;
}

@Injectable()
export class SegmentBuilderService {
  private readonly logger = new Logger(SegmentBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createSegment(segmentDto: SegmentCreateDto): Promise<Segment> {
    const segment = await this.prisma.cdpSegment.create({
      data: {
        name: segmentDto.name,
        description: segmentDto.description,
        type: segmentDto.type,
        sqlQuery: segmentDto.sqlQuery,
        visualConfig: segmentDto.visualConfig,
        conditions: segmentDto.conditions,
        tenantId: segmentDto.tenantId,
        isActive: segmentDto.isActive ?? true,
      },
    });

    this.logger.log(`Created segment: ${segment.name} (${segment.id})`);

    return {
      id: segment.id,
      name: segment.name,
      description: segment.description,
      type: segment.type as SegmentType,
      sqlQuery: segment.sqlQuery,
      visualConfig: segment.visualConfig,
      conditions: segment.conditions,
      tenantId: segment.tenantId,
      isActive: segment.isActive,
      userCount: 0,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    };
  }

  async listSegments(tenantId?: string): Promise<Segment[]> {
    const segments = await this.prisma.cdpSegment.findMany({
      where: tenantId ? { tenantId } : {},
      include: {
        _count: {
          select: {
            memberships: {
              where: { isActive: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return segments.map(segment => ({
      id: segment.id,
      name: segment.name,
      description: segment.description,
      type: segment.type as SegmentType,
      sqlQuery: segment.sqlQuery,
      visualConfig: segment.visualConfig,
      conditions: segment.conditions,
      tenantId: segment.tenantId,
      isActive: segment.isActive,
      userCount: segment._count.memberships,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    }));
  }

  async evaluateSegment(segmentId: string): Promise<SegmentEvaluationResult> {
    this.logger.log(`Evaluating segment: ${segmentId}`);

    const segment = await this.prisma.cdpSegment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      throw new Error(`Segment not found: ${segmentId}`);
    }

    let userIds: string[];

    // Execute query based on segment type
    switch (segment.type) {
      case 'SQL':
        userIds = await this.executeSqlSegment(segment);
        break;
      case 'VISUAL':
        userIds = await this.executeVisualSegment(segment);
        break;
      case 'BEHAVIORAL':
        userIds = await this.executeBehavioralSegment(segment);
        break;
      case 'DEMOGRAPHIC':
        userIds = await this.executeDemographicSegment(segment);
        break;
      default:
        throw new Error(`Unsupported segment type: ${segment.type}`);
    }

    // Get current memberships
    const currentMemberships = await this.prisma.cdpSegmentMembership.findMany({
      where: {
        segmentId,
        isActive: true,
      },
    });

    const currentUsers = new Set(currentMemberships.map(m => m.userId));
    const newUsers = new Set(userIds);

    // Calculate differences
    const usersToAdd = userIds.filter(id => !currentUsers.has(id));
    const usersToRemove = Array.from(currentUsers).filter(id => !newUsers.has(id));

    // Update memberships
    await this.updateSegmentMemberships(segmentId, usersToAdd, usersToRemove);

    const updates = [
      ...usersToAdd.map(userId => ({
        userId,
        segmentId,
        action: 'added' as const,
      })),
      ...usersToRemove.map(userId => ({
        userId,
        segmentId,
        action: 'removed' as const,
      })),
    ];

    return {
      segmentId,
      totalUsers: userIds.length,
      addedUsers: usersToAdd,
      removedUsers: usersToRemove,
      updates,
    };
  }

  private async executeSqlSegment(segment: any): Promise<string[]> {
    try {
      // Execute SQL query safely using Prisma's queryRaw
      const result = await this.prisma.$queryRaw`
        SELECT DISTINCT "userId" 
        FROM (${segment.sqlQuery}) as subquery 
        WHERE "userId" IS NOT NULL
      `;
      
      return (result as any[]).map(row => row.userId);
    } catch (error) {
      this.logger.error(`SQL segment execution failed: ${error.message}`);
      return [];
    }
  }

  private async executeVisualSegment(segment: any): Promise<string[]> {
    if (!segment.conditions || segment.conditions.length === 0) {
      return [];
    }

    // Build Prisma query from visual conditions
    let whereClause: any = {};

    for (const condition of segment.conditions) {
      const fieldCondition = this.buildFieldCondition(condition);
      
      if (condition.logicalOperator === 'OR') {
        whereClause = {
          ...whereClause,
          OR: [...(whereClause.OR || []), fieldCondition],
        };
      } else {
        whereClause = {
          ...whereClause,
          ...fieldCondition,
        };
      }
    }

    const users = await this.prisma.user.findMany({
      where: whereClause,
      select: { id: true },
    });

    return users.map(user => user.id);
  }

  private async executeBehavioralSegment(segment: any): Promise<string[]> {
    // Behavioral segments based on user events
    const timeWindow = segment.visualConfig?.timeWindow || '7d';
    const minEvents = segment.visualConfig?.minEvents || 5;
    const eventTypes = segment.visualConfig?.eventTypes || [];

    const startTime = this.getTimeWindowStart(timeWindow);

    const eventCounts = await this.prisma.cdpEvent.groupBy({
      by: ['userId'],
      where: {
        userId: { not: null },
        timestamp: { gte: startTime },
        ...(eventTypes.length > 0 && { 
          eventName: { in: eventTypes } 
        }),
      },
      _count: { id: true },
      having: {
        id: { _count: { gte: minEvents } },
      },
    });

    return eventCounts.map(count => count.userId as string);
  }

  private async executeDemographicSegment(segment: any): Promise<string[]> {
    // Demographic segments based on user profile data
    const conditions = segment.conditions || [];
    
    let whereClause: any = {};

    for (const condition of conditions) {
      const fieldCondition = this.buildDemographicCondition(condition);
      
      if (condition.logicalOperator === 'OR') {
        whereClause = {
          ...whereClause,
          OR: [...(whereClause.OR || []), fieldCondition],
        };
      } else {
        whereClause = {
          ...whereClause,
          ...fieldCondition,
        };
      }
    }

    const users = await this.prisma.user.findMany({
      where: whereClause,
      select: { id: true },
    });

    return users.map(user => user.id);
  }

  private buildFieldCondition(condition: any): any {
    const { field, operator, value } = condition;

    switch (operator) {
      case 'equals':
        return { [field]: value };
      case 'contains':
        return { [field]: { contains: value } };
      case 'greater_than':
        return { [field]: { gt: value } };
      case 'less_than':
        return { [field]: { lt: value } };
      case 'in':
        return { [field]: { in: value } };
      case 'not_in':
        return { [field]: { notIn: value } };
      default:
        return {};
    }
  }

  private buildDemographicCondition(condition: any): any {
    // Handle special demographic fields in profileData
    const { field, operator, value } = condition;

    if (field.startsWith('profileData.')) {
      const profileField = field.replace('profileData.', '');
      return {
        profileData: {
          path: [profileField],
          [operator === 'equals' ? 'equals' : 'contains']: value,
        },
      };
    }

    return this.buildFieldCondition(condition);
  }

  private getTimeWindowStart(window: string): Date {
    const now = new Date();
    
    switch (window) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }

  private async updateSegmentMemberships(
    segmentId: string,
    usersToAdd: string[],
    usersToRemove: string[],
  ) {
    const now = new Date();

    // Add new users
    if (usersToAdd.length > 0) {
      await this.prisma.cdpSegmentMembership.createMany({
        data: usersToAdd.map(userId => ({
          segmentId,
          userId,
          isActive: true,
          joinedAt: now,
        })),
        skipDuplicates: true,
      });
    }

    // Remove users
    if (usersToRemove.length > 0) {
      await this.prisma.cdpSegmentMembership.updateMany({
        where: {
          segmentId,
          userId: { in: usersToRemove },
          isActive: true,
        },
        data: {
          isActive: false,
          leftAt: now,
        },
      });
    }

    // Cache segment membership
    await this.cacheSegmentMembership(segmentId);
  }

  private async cacheSegmentMembership(segmentId: string) {
    const memberships = await this.prisma.cdpSegmentMembership.findMany({
      where: { segmentId, isActive: true },
      select: { userId: true },
    });

    const cacheKey = `cdp:segment:${segmentId}:users`;
    const userIds = memberships.map(m => m.userId);
    
    await this.redis.setex(cacheKey, 1800, JSON.stringify(userIds)); // Cache for 30 minutes
  }

  async getSegmentUsers(segmentId: string, limit: number, offset: number) {
    // Try cache first
    const cacheKey = `cdp:segment:${segmentId}:users`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      const userIds = JSON.parse(cached);
      const paginatedIds = userIds.slice(offset, offset + limit);
      
      const users = await this.prisma.user.findMany({
        where: { id: { in: paginatedIds } },
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          walletAddress: true,
          createdAt: true,
        },
      });

      return {
        users,
        total: userIds.length,
        limit,
        offset,
      };
    }

    // Fallback to database
    const memberships = await this.prisma.cdpSegmentMembership.findMany({
      where: { segmentId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            walletAddress: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.cdpSegmentMembership.count({
      where: { segmentId, isActive: true },
    });

    return {
      users: memberships.map(m => m.user),
      total,
      limit,
      offset,
    };
  }

  async getUserSegments(userId: string): Promise<UserSegment[]> {
    const memberships = await this.prisma.cdpSegmentMembership.findMany({
      where: { userId, isActive: true },
      include: {
        segment: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return memberships.map(membership => ({
      id: membership.segment.id,
      name: membership.segment.name,
      type: membership.segment.type,
      joinedAt: membership.joinedAt,
    }));
  }

  async updateSegmentMemberships(userId: string) {
    // Get all active segments
    const segments = await this.prisma.cdpSegment.findMany({
      where: { isActive: true },
    });

    // Evaluate each segment for this user
    for (const segment of segments) {
      await this.evaluateSegment(segment.id);
    }
  }
}
