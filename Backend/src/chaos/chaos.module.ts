import { Module } from '@nestjs/common';
import { ChaosController } from './chaos.controller';
import { ChaosService } from './chaos.service';
import { ChaosExperimentService } from './experiment.service';
import { ChaosMonitorService } from './monitor.service';

@Module({
  controllers: [ChaosController],
  providers: [ChaosService, ChaosExperimentService, ChaosMonitorService],
  exports: [ChaosService, ChaosExperimentService, ChaosMonitorService],
})
export class ChaosModule {}
