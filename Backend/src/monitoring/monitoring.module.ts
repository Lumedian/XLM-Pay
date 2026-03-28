import { Module } from '@nestjs/common';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [CircuitBreakerModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, PrismaService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
