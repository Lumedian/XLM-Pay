import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { TenantManagementService } from './tenant-management.service';
import { TenantUsageService } from './tenant-usage.service';

@Injectable()
export class TenantUsageInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantUsageInterceptor.name);

  constructor(
    private readonly tenantManagementService: TenantManagementService,
    private readonly tenantUsageService: TenantUsageService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.captureRequestUsage(request, Date.now() - startedAt);
        },
        error: () => {
          this.captureRequestUsage(request, Date.now() - startedAt);
        },
      }),
    );
  }

  private captureRequestUsage(request: Request, durationMs: number): void {
    void this.tenantManagementService
      .getCurrentTenant()
      .then((tenant) =>
        this.tenantUsageService.recordUsageForTenantId(tenant.id, {
          metric: 'API_REQUEST',
          quantity: 1,
          metadata: {
            method: request.method,
            path: request.path,
            durationMs,
          },
        }),
      )
      .catch((error: Error) => {
        this.logger.debug(`Skipping tenant usage capture: ${error.message}`);
      });
  }
}
