import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaClient } from '@prisma/client';

type AuditContextSnapshot = {
  requestId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  route?: string;
  query?: Record<string, unknown>;
  requestBody?: unknown;
  auditDisabled?: boolean;
};

type CrudAuditEntry = {
  model: string;
  operation: string;
  entityId?: string | null;
  success: boolean;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
};

type AuditLoggerConfig = {
  getContext: () => AuditContextSnapshot | undefined;
  writeCrudLog: (entry: CrudAuditEntry) => Promise<void>;
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private auditLoggerConfig?: AuditLoggerConfig;
  private readonly delegateCache = new Map<string, unknown>();

  constructor() {
    super();

    return new Proxy(this, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);

        if (typeof property !== 'string') {
          return value;
        }

        if (typeof value === 'function') {
          return value.bind(target);
        }

        if (!target.isModelDelegate(value)) {
          return value;
        }

        if (!target.delegateCache.has(property)) {
          target.delegateCache.set(property, target.createAuditAwareDelegate(property, value));
        }

        return target.delegateCache.get(property);
      },
    }) as this;
  }

  registerAuditLogger(config: AuditLoggerConfig) {
    this.auditLoggerConfig = config;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private isModelDelegate(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return false;
    }

    return ['findUnique', 'findMany', 'create', 'update', 'delete'].some(
      (method) => typeof (value as Record<string, unknown>)[method] === 'function',
    );
  }

  private createAuditAwareDelegate(model: string, delegate: Record<string, unknown>) {
    return new Proxy(delegate, {
      get: (target, property, receiver) => {
        const original = Reflect.get(target, property, receiver);

        if (typeof original !== 'function' || typeof property !== 'string') {
          return original;
        }

        if (!this.isAuditedOperation(property)) {
          return original.bind(target);
        }

        return async (args?: Record<string, unknown>) =>
          this.executeAuditedOperation(
            model,
            property,
            target as Record<string, (...args: unknown[]) => Promise<unknown>>,
            original.bind(target),
            args,
          );
      },
    });
  }

  private isAuditedOperation(operation: string) {
    return [
      'create',
      'createMany',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
    ].includes(operation);
  }

  private async executeAuditedOperation(
    model: string,
    operation: string,
    delegate: Record<string, (...args: unknown[]) => Promise<unknown>>,
    execute: (args?: Record<string, unknown>) => Promise<unknown>,
    args?: Record<string, unknown>,
  ) {
    const context = this.auditLoggerConfig?.getContext();

    if (model === 'auditLog' && !context?.auditDisabled) {
      throw new Error('Audit log records are immutable and cannot be modified directly.');
    }

    if (!this.auditLoggerConfig || context?.auditDisabled) {
      return execute(args);
    }

    let beforeData: unknown;

    if (['update', 'delete', 'upsert'].includes(operation)) {
      beforeData = await this.captureBeforeState(delegate, args);
    }

    try {
      const result = await execute(args);

      await this.auditLoggerConfig.writeCrudLog({
        model,
        operation,
        entityId: this.resolveEntityId(result, beforeData, args),
        success: true,
        beforeData,
        afterData: this.resolveAfterState(operation, result),
        metadata: this.buildOperationMetadata(operation, args, result),
      });

      return result;
    } catch (error) {
      await this.auditLoggerConfig.writeCrudLog({
        model,
        operation,
        entityId: this.resolveEntityId(undefined, beforeData, args),
        success: false,
        beforeData,
        metadata: this.buildOperationMetadata(operation, args),
        errorMessage: error instanceof Error ? error.message : 'Unknown Prisma operation error',
      });

      throw error;
    }
  }

  private async captureBeforeState(
    delegate: Record<string, (...args: unknown[]) => Promise<unknown>>,
    args?: Record<string, unknown>,
  ) {
    if (!args?.where) {
      return null;
    }

    if (typeof delegate.findUnique === 'function') {
      return delegate.findUnique({ where: args.where });
    }

    if (typeof delegate.findFirst === 'function') {
      return delegate.findFirst({ where: args.where });
    }

    return null;
  }

  private resolveAfterState(operation: string, result: unknown) {
    if (['delete', 'deleteMany'].includes(operation)) {
      return null;
    }

    return result;
  }

  private resolveEntityId(result?: unknown, beforeData?: unknown, args?: Record<string, unknown>) {
    const resultId = this.extractId(result);
    if (resultId) {
      return resultId;
    }

    const beforeId = this.extractId(beforeData);
    if (beforeId) {
      return beforeId;
    }

    return this.extractId(args?.where);
  }

  private extractId(value: unknown) {
    if (!value || typeof value !== 'object') {
      return null;
    }

    if ('id' in (value as Record<string, unknown>)) {
      const rawId = (value as Record<string, unknown>).id;
      return rawId == null ? null : String(rawId);
    }

    return null;
  }

  private buildOperationMetadata(
    operation: string,
    args?: Record<string, unknown>,
    result?: unknown,
  ) {
    const metadata: Record<string, unknown> = {
      operation,
      where: args?.where,
      data: args?.data,
      select: args?.select,
      include: args?.include,
    };

    if (result && typeof result === 'object' && 'count' in (result as Record<string, unknown>)) {
      metadata.affectedCount = (result as Record<string, unknown>).count;
    }

    return metadata;
  }
}
