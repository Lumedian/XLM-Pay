import { AuditEventType } from '@prisma/client';

export type AuditRequestContext = {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  route?: string;
  query?: Record<string, unknown>;
  requestBody?: unknown;
  userId?: string;
  auditDisabled?: boolean;
};

export type WriteAuditLogInput = {
  requestId?: string;
  eventType: AuditEventType;
  action: string;
  entityType?: string;
  entityId?: string | null;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  httpMethod?: string;
  path?: string;
  route?: string;
  statusCode?: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  requestBody?: unknown;
  responseBody?: unknown;
  beforeData?: unknown;
  afterData?: unknown;
  occurredAt?: Date;
};

export type AuditLogQuery = {
  page: number;
  pageSize: number;
  eventType?: AuditEventType;
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  requestId?: string;
  method?: string;
  success?: boolean;
  from?: Date;
  to?: Date;
};
