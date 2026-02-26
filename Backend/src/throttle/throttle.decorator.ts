import { SetMetadata } from '@nestjs/common';

export const THROTTLE_STRATEGY_KEY = 'throttle_strategy';

/**
 * Decorator to apply a specific rate limiting strategy to an endpoint
 *
 * @param name The name of the strategy from STRATEGIES in throttle.constants.ts
 */
export const ThrottleStrategy = (name: string) =>
  SetMetadata(THROTTLE_STRATEGY_KEY, name);
