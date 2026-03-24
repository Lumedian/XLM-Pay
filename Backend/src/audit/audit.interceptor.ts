import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuditLogService } from './audit-log.service';
import { AuditContextService } from './audit-context.service';
import { sanitizeForAudit } from './audit.utils';

@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
    constructor(
        private readonly auditLogService: AuditLogService,
        private readonly auditContextService: AuditContextService,
    ) { }

    intercept (context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'http') {
            return next.handle();
        }

        const http = context.switchToHttp();
        const request = http.getRequest();
        const response = http.getResponse();
        const startedAt = Date.now();

        this.auditContextService.setContext({
            userId: request.user?.id,
            route: request.route?.path,
        });

        return next.handle().pipe(
            tap((body) => {
                this.auditContextService.setContext({
                    userId: request.user?.id,
                    route: request.route?.path,
                });

                void this.auditLogService.logRequest({
                    statusCode: response.statusCode,
                    success: response.statusCode < 400,
                    responseBody: sanitizeForAudit(body),
                    metadata: {
                        durationMs: Date.now() - startedAt,
                    },
                });
            }),
            catchError((error) => {
                this.auditContextService.setContext({
                    userId: request.user?.id,
                    route: request.route?.path,
                });

                void this.auditLogService.logRequest({
                    statusCode: error?.status || response.statusCode || 500,
                    success: false,
                    errorMessage: error?.message || 'Unhandled request error',
                    responseBody: sanitizeForAudit(error?.response),
                    metadata: {
                        durationMs: Date.now() - startedAt,
                    },
                });

                return throwError(() => error);
            }),
        );
    }
}