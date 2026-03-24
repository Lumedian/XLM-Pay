import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AuditRequestContext } from './audit.types';

@Injectable()
export class AuditContextService {
    private readonly asyncLocalStorage = new AsyncLocalStorage<AuditRequestContext>();

    runWithContext<T> (context: AuditRequestContext, callback: () => T) {
        return this.asyncLocalStorage.run(context, callback);
    }

    getContext () {
        return this.asyncLocalStorage.getStore();
    }

    setContext (values: Partial<AuditRequestContext>) {
        const current = this.asyncLocalStorage.getStore();

        if (!current) {
            return;
        }

        Object.assign(current, values);
    }

    async withAuditDisabled<T> (callback: () => Promise<T>) {
        const current = this.asyncLocalStorage.getStore();

        if (!current) {
            return this.asyncLocalStorage.run(
                {
                    requestId: 'system',
                    auditDisabled: true,
                },
                callback,
            );
        }

        const nextContext: AuditRequestContext = {
            ...current,
            auditDisabled: true,
        };

        return this.asyncLocalStorage.run(nextContext, callback);
    }
}