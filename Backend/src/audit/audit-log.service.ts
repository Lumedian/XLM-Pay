import { AuditEventType, Prisma } from '@prisma/client';
import { AuditLogQuery, WriteAuditLogInput } from './audit.types';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, OnModuleInit } from '@nestjs/common';

import { AuditContextService } from './audit-context.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { createHash } from 'node:crypto';
import { sanitizeForAudit } from './audit.utils';

@Injectable()
export class AuditLogService implements OnModuleInit {
  private readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditContextService: AuditContextService,
    private readonly configService: ConfigService,
  ) {
    this.retentionDays = Number(this.configService.get('AUDIT_LOG_RETENTION_DAYS', 365));
  }

  onModuleInit() {
    this.prisma.registerAuditLogger({
      getContext: () => this.auditContextService.getContext(),
      writeCrudLog: (entry) => this.logCrudOperation(entry),
    });
  }

  async logRequest(input: {
    statusCode?: number;
    success: boolean;
    errorMessage?: string;
    responseBody?: unknown;
    metadata?: Record<string, unknown>;
  }) {
    const context = this.auditContextService.getContext();

    return this.writeLog({
      requestId: context?.requestId,
      eventType: AuditEventType.REQUEST,
      action: `${context?.method || 'UNKNOWN'} ${context?.path || '/'}`,
      userId: context?.userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      httpMethod: context?.method,
      path: context?.path,
      route: context?.route,
      statusCode: input.statusCode,
      success: input.success,
      errorMessage: input.errorMessage,
      requestBody: context?.requestBody,
      responseBody: input.responseBody,
      metadata: {
        ...input.metadata,
        query: context?.query,
      },
    });
  }

  async logCrudOperation(input: {
    model: string;
    operation: string;
    entityId?: string | null;
    success: boolean;
    beforeData?: unknown;
    afterData?: unknown;
    metadata?: Record<string, unknown>;
    errorMessage?: string;
  }) {
    const context = this.auditContextService.getContext();

    return this.writeLog({
      requestId: context?.requestId,
      eventType: AuditEventType.CRUD,
      action: `${input.model}.${input.operation}`,
      entityType: input.model,
      entityId: input.entityId,
      userId: context?.userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      httpMethod: context?.method,
      path: context?.path,
      route: context?.route,
      success: input.success,
      errorMessage: input.errorMessage,
      beforeData: input.beforeData,
      afterData: input.afterData,
      metadata: input.metadata,
    });
  }

  async logSystemEvent(action: string, metadata?: Record<string, unknown>) {
    return this.writeLog({
      eventType: AuditEventType.SYSTEM,
      action,
      success: true,
      metadata,
    });
  }

  async queryLogs(query: AuditLogQuery) {
    const where: Prisma.AuditLogWhereInput = {
      eventType: query.eventType,
      action: query.action ? { contains: query.action, mode: 'insensitive' } : undefined,
      entityType: query.entityType,
      entityId: query.entityId,
      userId: query.userId,
      requestId: query.requestId,
      httpMethod: query.method,
      success: query.success,
      occurredAt:
        query.from || query.to
          ? {
              gte: query.from,
              lte: query.to,
            }
          : undefined,
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpiredLogs() {
    const deleted = await this.auditContextService.withAuditDisabled(async () =>
      this.prisma.auditLog.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      }),
    );

    if (deleted.count > 0) {
      await this.logSystemEvent('audit.retention.cleanup', {
        deletedCount: deleted.count,
      });
    }

    return deleted;
  }

  private async writeLog(input: WriteAuditLogInput) {
    const occurredAt = input.occurredAt ?? new Date();
    const expiresAt = new Date(occurredAt);
    expiresAt.setDate(expiresAt.getDate() + this.retentionDays);

    const sanitized = {
      requestBody: sanitizeForAudit(input.requestBody),
      responseBody: sanitizeForAudit(input.responseBody),
      beforeData: sanitizeForAudit(input.beforeData),
      afterData: sanitizeForAudit(input.afterData),
      metadata: sanitizeForAudit(input.metadata) as Record<string, unknown> | undefined,
    };

    await this.auditContextService.withAuditDisabled(async () => {
      const previousLog = await this.prisma.auditLog.findFirst({
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          hash: true,
        },
      });

      const payloadForHash = {
        requestId: input.requestId,
        eventType: input.eventType,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        httpMethod: input.httpMethod,
        path: input.path,
        route: input.route,
        statusCode: input.statusCode,
        success: input.success,
        errorMessage: input.errorMessage,
        requestBody: sanitized.requestBody,
        responseBody: sanitized.responseBody,
        beforeData: sanitized.beforeData,
        afterData: sanitized.afterData,
        metadata: sanitized.metadata,
        occurredAt: occurredAt.toISOString(),
        previousHash: previousLog?.hash || null,
      };

      const hash = createHash('sha256').update(JSON.stringify(payloadForHash)).digest('hex');

      await this.prisma.auditLog.create({
        data: {
          requestId: input.requestId,
          eventType: input.eventType,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          userId: input.userId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          httpMethod: input.httpMethod,
          path: input.path,
          route: input.route,
          statusCode: input.statusCode,
          success: input.success,
          errorMessage: input.errorMessage,
          metadata: sanitized.metadata as Prisma.InputJsonValue,
          requestBody: sanitized.requestBody as Prisma.InputJsonValue,
          responseBody: sanitized.responseBody as Prisma.InputJsonValue,
          beforeData: sanitized.beforeData as Prisma.InputJsonValue,
          afterData: sanitized.afterData as Prisma.InputJsonValue,
          previousHash: previousLog?.hash,
          hash,
          occurredAt,
          expiresAt,
        },
      });
    });
  }
}
