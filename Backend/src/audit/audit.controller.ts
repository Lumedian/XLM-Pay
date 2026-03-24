import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
export class AuditController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async getAuditLogs(@Query() query: QueryAuditLogsDto) {
    return this.auditLogService.queryLogs({
      page: query.page || 1,
      pageSize: query.pageSize || 25,
      eventType: query.eventType,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      userId: query.userId,
      requestId: query.requestId,
      method: query.method,
      success: query.success,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
