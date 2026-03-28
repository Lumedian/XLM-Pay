import { Prisma } from '@prisma/client';

export function tenantIsolationMiddleware() {
  return async (params: Prisma.MiddlewareParams, next: any) => {
    const tenantId = (params as any).tenantId;

    if (!tenantId) {
      throw new Error('Missing tenantId');
    }

    // validate queries
    if (params.action.includes('find') || params.action.includes('update')) {
      if (!params.args?.where?.tenantId) {
        throw new Error(`Tenant isolation breach: ${params.model}`);
      }
    }

    return next(params);
  };
}