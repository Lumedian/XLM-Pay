import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { AuditContextService } from './audit-context.service';
import { extractIpAddress, sanitizeForAudit } from './audit.utils';

@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
    constructor(private readonly auditContextService: AuditContextService) { }

    use (req: Request, res: Response, next: NextFunction) {
        const requestId =
            typeof req.headers['x-request-id'] === 'string'
                ? req.headers['x-request-id']
                : randomUUID();

        this.auditContextService.runWithContext(
            {
                requestId,
                ipAddress: extractIpAddress(req.headers as Record<string, unknown>, req.ip),
                userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
                method: req.method,
                path: req.originalUrl || req.url,
                route: req.route?.path,
                query: sanitizeForAudit(req.query) as Record<string, unknown>,
                requestBody: sanitizeForAudit(req.body),
            },
            () => {
                res.setHeader('x-request-id', requestId);
                next();
            },
        );
    }
}