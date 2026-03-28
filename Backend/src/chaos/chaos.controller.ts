import { Controller, Get, Post, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ChaosService } from './chaos.service';
import { ChaosExperimentService } from './experiment.service';
import { ChaosMonitorService } from './monitor.service';

export class RunExperimentDto {
  type: string;
  duration?: number;
  intensity?: number;
}

export class UpdateConfigDto {
  enabled?: boolean;
  blastRadius?: 'small' | 'medium' | 'large';
  safeMode?: boolean;
  businessHoursOnly?: boolean;
  maxExperiments?: number;
}

@Controller('chaos')
export class ChaosController {
  constructor(
    private readonly chaosService: ChaosService,
    private readonly experimentService: ChaosExperimentService,
    private readonly monitorService: ChaosMonitorService,
  ) {}

  @Get('status')
  getSystemStatus() {
    return this.chaosService.getSystemHealth();
  }

  @Get('config')
  getConfig() {
    return this.chaosService.getConfig();
  }

  @Post('config')
  updateConfig(@Body() config: UpdateConfigDto) {
    return this.chaosService.updateConfig(config);
  }

  @Post('experiment')
  @HttpCode(HttpStatus.OK)
  async runExperiment(@Body() dto: RunExperimentDto) {
    return await this.chaosService.runExperiment(dto.type, {
      duration: dto.duration,
      intensity: dto.intensity,
    });
  }

  @Delete('experiment')
  @HttpCode(HttpStatus.OK)
  stopAllExperiments() {
    return this.chaosService.stopAllExperiments();
  }

  @Get('experiments')
  getExperimentHistory() {
    return this.experimentService.getExperimentHistory();
  }

  @Get('experiments/active')
  getActiveExperiments() {
    return this.experimentService.getActiveExperiments();
  }

  @Get('metrics/resilience')
  getResilienceScore() {
    return this.monitorService.getResilienceTrend();
  }

  @Get('metrics/history')
  getMetricsHistory() {
    return this.monitorService.getExperimentHistory();
  }
}
