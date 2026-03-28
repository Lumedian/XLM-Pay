import { Injectable, Logger } from '@nestjs/common';
import { ChaosExperimentService } from './experiment.service';
import { ChaosMonitorService } from './monitor.service';

export interface ChaosConfig {
  enabled: boolean;
  blastRadius: 'small' | 'medium' | 'large';
  safeMode: boolean;
  businessHoursOnly: boolean;
  maxExperiments: number;
}

@Injectable()
export class ChaosService {
  private readonly logger = new Logger(ChaosService.name);
  private config: ChaosConfig = {
    enabled: false,
    blastRadius: 'small',
    safeMode: true,
    businessHoursOnly: true,
    maxExperiments: 3,
  };

  constructor(
    private experimentService: ChaosExperimentService,
    private monitorService: ChaosMonitorService,
  ) {}

  getConfig(): ChaosConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ChaosConfig>): ChaosConfig {
    this.config = { ...this.config, ...config };
    this.logger.log(`Chaos config updated: ${JSON.stringify(this.config)}`);
    return this.config;
  }

  async runExperiment(experimentType: string, options?: any): Promise<any> {
    if (!this.config.enabled) {
      throw new Error('Chaos engineering is disabled');
    }

    if (this.isBusinessHours() && this.config.businessHoursOnly) {
      throw new Error('Cannot run experiments during business hours');
    }

    const activeExperiments = this.experimentService.getActiveExperiments();
    if (activeExperiments.length >= this.config.maxExperiments) {
      throw new Error('Maximum concurrent experiments reached');
    }

    this.logger.log(`Starting chaos experiment: ${experimentType}`);
    
    try {
      const result = await this.experimentService.executeExperiment(
        experimentType,
        {
          blastRadius: this.config.blastRadius,
          safeMode: this.config.safeMode,
          ...options,
        },
      );

      this.monitorService.recordExperiment(experimentType, result);
      return result;
    } catch (error) {
      this.logger.error(`Chaos experiment failed: ${error.message}`);
      throw error;
    }
  }

  async stopAllExperiments(): Promise<void> {
    this.logger.log('Stopping all chaos experiments');
    await this.experimentService.stopAllExperiments();
  }

  private isBusinessHours(): boolean {
    const hour = new Date().getHours();
    return hour >= 9 && hour <= 17;
  }

  getSystemHealth(): any {
    return this.monitorService.getSystemHealth();
  }
}
