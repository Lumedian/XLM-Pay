import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantContextService: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const tenantHeader = this.configService.get<string>('TENANT_HEADER', 'x-tenant-id');
    const tenantIdentifier = req.header(tenantHeader) || undefined;

    this.tenantContextService.run({ tenantIdentifier }, () => next());
  }
}
