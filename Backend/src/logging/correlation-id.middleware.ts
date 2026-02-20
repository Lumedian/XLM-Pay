import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { RequestContext } from './request-context';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const existing = req.headers['x-correlation-id'] as string;
    const correlationId = existing || uuidv4();

    // make available on request object too
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    // start a context for async storage
    RequestContext.run(() => {
      RequestContext.set('correlationId', correlationId);
      next();
    });
  }
}
