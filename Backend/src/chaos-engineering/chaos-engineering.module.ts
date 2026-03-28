import { Module, Global } from '@nestjs/common';
import { ChaosEngineService } from './services/chaos-engine.service';
import { ChaosReportingService } from './services/chaos-reporting.service';
import { ChaosSchedulerService } from './services/chaos-scheduler.service';
import { ChaosEngineeringController } from './chaos-engineering.controller';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggingModule } from '../logging/logging.module';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ConfigModule,
    LoggingModule,
  ],
  controllers: [ChaosEngineeringController],
  providers: [
    ChaosEngineService,
    ChaosReportingService,
    ChaosSchedulerService,
  ],
  exports: [
    ChaosEngineService,
    ChaosReportingService,
    ChaosSchedulerService,
  ],
})
export class ChaosEngineeringModule {}
