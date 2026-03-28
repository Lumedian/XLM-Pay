import { Injectable, Logger } from '@nestjs/common';

export interface ExperimentOptions {
  blastRadius: 'small' | 'medium' | 'large';
  safeMode: boolean;
  duration?: number;
  intensity?: number;
}

export interface ExperimentResult {
  experimentId: string;
  type: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  metrics: any;
  error?: string;
}

@Injectable()
export class ChaosExperimentService {
  private readonly logger = new Logger(ChaosExperimentService.name);
  private activeExperiments = new Map<string, ExperimentResult>();

  async executeExperiment(
    type: string,
    options: ExperimentOptions,
  ): Promise<ExperimentResult> {
    const experimentId = this.generateExperimentId();
    const result: ExperimentResult = {
      experimentId,
      type,
      startTime: new Date(),
      status: 'running',
      metrics: {},
    };

    this.activeExperiments.set(experimentId, result);

    try {
      switch (type) {
        case 'latency':
          await this.injectLatency(experimentId, options);
          break;
        case 'memory-stress':
          await this.injectMemoryStress(experimentId, options);
          break;
        case 'cpu-stress':
          await this.injectCpuStress(experimentId, options);
          break;
        case 'failure':
          await this.injectFailure(experimentId, options);
          break;
        default:
          throw new Error(`Unknown experiment type: ${type}`);
      }

      result.status = 'completed';
      result.endTime = new Date();
    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
      result.endTime = new Date();
    }

    return result;
  }

  private async injectLatency(
    experimentId: string,
    options: ExperimentOptions,
  ): Promise<void> {
    const delay = options.intensity ? options.intensity * 1000 : 1000;
    this.logger.log(`Injecting ${delay}ms latency for experiment ${experimentId}`);

    const startTime = Date.now();
    const originalSetTimeout = global.setTimeout;
    
    global.setTimeout = ((callback: Function, delay: number, ...args: any[]) => {
      const enhancedDelay = delay + (Math.random() * delay * 0.5);
      return originalSetTimeout(callback, enhancedDelay, ...args);
    }) as any;

    if (options.duration) {
      await this.sleep(options.duration);
      global.setTimeout = originalSetTimeout;
    }

    const experiment = this.activeExperiments.get(experimentId);
    if (experiment) {
      experiment.metrics = {
        totalDelayInjected: Date.now() - startTime,
        averageLatency: delay,
      };
    }
  }

  private async injectMemoryStress(
    experimentId: string,
    options: ExperimentOptions,
  ): Promise<void> {
    this.logger.log(`Injecting memory stress for experiment ${experimentId}`);
    
    const memoryArrays: any[] = [];
    const size = options.intensity ? options.intensity * 1000000 : 1000000;
    
    const interval = setInterval(() => {
      try {
        memoryArrays.push(new Array(size).fill(Math.random()));
        
        const experiment = this.activeExperiments.get(experimentId);
        if (experiment) {
          experiment.metrics = {
            memoryAllocated: process.memoryUsage().heapUsed,
            arraysCreated: memoryArrays.length,
          };
        }
      } catch (error) {
        clearInterval(interval);
        throw error;
      }
    }, 1000);

    if (options.duration) {
      await this.sleep(options.duration);
      clearInterval(interval);
      memoryArrays.length = 0;
    }
  }

  private async injectCpuStress(
    experimentId: string,
    options: ExperimentOptions,
  ): Promise<void> {
    this.logger.log(`Injecting CPU stress for experiment ${experimentId}`);
    
    const startTime = Date.now();
    let iterations = 0;
    
    const interval = setInterval(() => {
      for (let i = 0; i < 1000000; i++) {
        Math.sqrt(Math.random() * 1000000);
      }
      iterations++;
      
      const experiment = this.activeExperiments.get(experimentId);
      if (experiment) {
        experiment.metrics = {
          iterations,
          duration: Date.now() - startTime,
        };
      }
    }, 10);

    if (options.duration) {
      await this.sleep(options.duration);
      clearInterval(interval);
    }
  }

  private async injectFailure(
    experimentId: string,
    options: ExperimentOptions,
  ): Promise<void> {
    this.logger.log(`Injecting failure for experiment ${experimentId}`);
    
    const failureRate = options.intensity ? options.intensity / 100 : 0.1;
    const originalFetch = global.fetch;
    
    global.fetch = async (...args: any[]) => {
      if (Math.random() < failureRate) {
        throw new Error('Simulated network failure');
      }
      return originalFetch(...args);
    };

    if (options.duration) {
      await this.sleep(options.duration);
      global.fetch = originalFetch;
    }

    const experiment = this.activeExperiments.get(experimentId);
    if (experiment) {
      experiment.metrics = {
        failureRate,
        duration: options.duration || 5000,
      };
    }
  }

  stopAllExperiments(): void {
    this.logger.log('Stopping all experiments');
    for (const [id, experiment] of this.activeExperiments) {
      if (experiment.status === 'running') {
        experiment.status = 'stopped';
        experiment.endTime = new Date();
      }
    }
  }

  getActiveExperiments(): ExperimentResult[] {
    return Array.from(this.activeExperiments.values()).filter(
      (exp) => exp.status === 'running',
    );
  }

  getExperimentHistory(): ExperimentResult[] {
    return Array.from(this.activeExperiments.values());
  }

  private generateExperimentId(): string {
    return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
