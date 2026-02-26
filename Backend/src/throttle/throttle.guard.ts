import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottleService } from './throttle.service';
import { STRATEGIES } from './throttle.constants';
import { THROTTLE_STRATEGY_KEY } from './throttle.decorator';

@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly throttle: ThrottleService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const ip = req.ip;
    const user = req.user;
    const identifier = user?.id ?? ip;
    const role = user?.role ?? 'user';

    await this.throttle.checkBan(identifier);

    // Get strategy from metadata or fall back to defaults
    const strategyName = this.reflector.getAllAndOverride<string>(
      THROTTLE_STRATEGY_KEY,
      [context.getHandler(), context.getClass()],
    );

    let strategy = STRATEGIES[strategyName];

    if (!strategy) {
      const isAuthRoute = req.path.includes('/auth');
      strategy = isAuthRoute ? STRATEGIES.AUTH : STRATEGIES.GLOBAL;
    }

    const key = `rate:${strategyName || (req.path.includes('/auth') ? 'AUTH' : 'GLOBAL')}:${identifier}`;

    const { current, limit, ttl } = await this.throttle.checkRateLimit(
      key,
      strategy.limit,
      strategy.window,
      role,
      strategyName || (req.path.includes('/auth') ? 'AUTH' : 'GLOBAL'),
    );

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));
    res.setHeader('X-RateLimit-Reset', ttl);

    if (current > limit) {
      await this.throttle.registerViolation(
        identifier,
        strategyName || (req.path.includes('/auth') ? 'AUTH' : 'GLOBAL'),
      );
      throw new HttpException(
        'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
