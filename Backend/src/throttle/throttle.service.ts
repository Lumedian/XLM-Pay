import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { BAN_RULES, ROLE_LIMIT_MULTIPLIERS } from './throttle.constants';
import { buildBanKey } from './throttle.util';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../observability/services/metrics.service';

@Injectable()
export class ThrottleService {
  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Atomic rate limit check using Lua Script
   */
  async checkRateLimit(
    key: string,
    baseLimit: number,
    windowSeconds: number,
    role: string = 'user',
    strategy: string = 'GLOBAL',
  ) {
    const multiplier = ROLE_LIMIT_MULTIPLIERS[role] || 1;
    const limit = Math.floor(baseLimit * multiplier);

    // Lua script to increment and set expiry in one atomic operation
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return {current, tonumber(redis.call('TTL', KEYS[1]))}
    `;

    const [current, ttl] = (await this.redis.client.eval(script, {
      keys: [key],
      arguments: [windowSeconds.toString()],
    })) as [number, number];

    this.metrics.recordRateLimitHit(
      strategy,
      key.split(':').pop() || 'unknown',
    );

    return { current, limit, ttl };
  }

  async checkBan(identifier: string) {
    const banned = await this.redis.client.get(buildBanKey(identifier));
    if (banned) {
      throw new HttpException(
        'Temporarily banned',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async registerViolation(identifier: string, strategy: string = 'GLOBAL') {
    const violationsKey = `violations:${identifier}`;

    // Using another small script for violation tracking
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], '3600')
      end
      return current
    `;

    const violations = (await this.redis.client.eval(script, {
      keys: [violationsKey],
    })) as number;

    this.metrics.recordRateLimitViolation(strategy, identifier);

    if (violations >= BAN_RULES.MAX_VIOLATIONS) {
      const banSeconds =
        BAN_RULES.BASE_BAN_SECONDS * Math.pow(2, violations - 1);

      await this.redis.client.setEx(buildBanKey(identifier), banSeconds, '1');

      this.metrics.recordRateLimitBan(identifier);
    }
  }
}
