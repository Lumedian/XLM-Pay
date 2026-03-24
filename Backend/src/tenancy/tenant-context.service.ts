import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { TenantRequestContext } from './interfaces/tenant-request-context.interface';

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantRequestContext>();

  run<T>(context: TenantRequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  getTenantIdentifier(): string | undefined {
    return this.storage.getStore()?.tenantIdentifier;
  }
}
