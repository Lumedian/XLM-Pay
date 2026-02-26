import { Module } from '@nestjs/common';
import { ThrottleService } from './throttle.service';
import { ThrottleGuard } from './throttle.guard';
import { RedisModule } from '../redis/redis.module';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
  imports: [RedisModule, ObservabilityModule],
  providers: [ThrottleService, ThrottleGuard],
  exports: [ThrottleGuard, ThrottleService],
})
export class ThrottleModule {}
