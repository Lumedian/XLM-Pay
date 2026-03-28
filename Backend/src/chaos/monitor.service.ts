import { Injectable, Logger } from '@nestjs/common';

export interface SystemMetrics {
  timestamp: Date;
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  responseTime: number;
  errorRate: number;
  throughput: number;
}

export interface ExperimentRecord {
  experimentId: string;
  type: string;
  timestamp: Date;
  result: any;
  systemMetrics: SystemMetrics;
}

export interface ResilienceScore {
  overall: number;
  availability: number;
  performance: number;
  errorHandling: number;
  recovery: number;
}

@Injectable()
export class ChaosMonitorService {
  private readonly logger = new Logger(ChaosMonitorService.name);
  private experimentHistory: ExperimentRecord[] = [];
  private baselineMetrics: SystemMetrics;
  private requestCount = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];

  constructor() {
    this.baselineMetrics = this.captureCurrentMetrics();
    this.startMonitoring();
  }

  recordExperiment(experimentType: string, result: any): void {
    const metrics = this.captureCurrentMetrics();
    const record: ExperimentRecord = {
      experimentId: result.experimentId,
      type: experimentType,
      timestamp: new Date(),
      result,
      systemMetrics: metrics,
    };

    this.experimentHistory.push(record);
    this.logger.log(`Recorded experiment: ${experimentType}`);
  }

  getSystemHealth(): any {
    const metrics = this.captureCurrentMetrics();
    const resilienceScore = this.calculateResilienceScore();

    return {
      metrics,
      resilienceScore,
      activeExperiments: this.getActiveExperimentCount(),
      totalExperiments: this.experimentHistory.length,
      systemStatus: this.getSystemStatus(metrics),
    };
  }

  getExperimentHistory(limit = 50): ExperimentRecord[] {
    return this.experimentHistory.slice(-limit);
  }

  getResilienceTrend(): any {
    const recentExperiments = this.experimentHistory.slice(-10);
    
    if (recentExperiments.length === 0) {
      return { trend: 'stable', scores: [] };
    }

    const scores = recentExperiments.map(exp => 
      this.calculateResilienceScoreForExperiment(exp)
    );

    const averageScore = scores.reduce((a, b) => a + b.overall, 0) / scores.length;
    const trend = averageScore > 70 ? 'improving' : averageScore < 50 ? 'degrading' : 'stable';

    return { trend, scores, averageScore };
  }

  recordRequest(responseTime: number, isError = false): void {
    this.requestCount++;
    if (isError) {
      this.errorCount++;
    }
    
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
  }

  private captureCurrentMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      timestamp: new Date(),
      cpu: (cpuUsage.user + cpuUsage.system) / 1000000,
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      responseTime: this.getAverageResponseTime(),
      errorRate: this.getErrorRate(),
      throughput: this.requestCount / 60,
    };
  }

  private calculateResilienceScore(): ResilienceScore {
    const currentMetrics = this.captureCurrentMetrics();
    
    const availability = Math.max(0, 100 - (currentMetrics.errorRate * 100));
    const performance = Math.max(0, 100 - (currentMetrics.responseTime / 10));
    const errorHandling = Math.max(0, 100 - (currentMetrics.errorRate * 50));
    const recovery = this.calculateRecoveryScore();
    
    const overall = (availability + performance + errorHandling + recovery) / 4;

    return {
      overall: Math.round(overall),
      availability: Math.round(availability),
      performance: Math.round(performance),
      errorHandling: Math.round(errorHandling),
      recovery: Math.round(recovery),
    };
  }

  private calculateResilienceScoreForExperiment(experiment: ExperimentRecord): ResilienceScore {
    const metrics = experiment.systemMetrics;
    
    const availability = Math.max(0, 100 - (metrics.errorRate * 100));
    const performance = Math.max(0, 100 - (metrics.responseTime / 10));
    const errorHandling = Math.max(0, 100 - (metrics.errorRate * 50));
    const recovery = 75;
    
    const overall = (availability + performance + errorHandling + recovery) / 4;

    return {
      overall: Math.round(overall),
      availability: Math.round(availability),
      performance: Math.round(performance),
      errorHandling: Math.round(errorHandling),
      recovery: Math.round(recovery),
    };
  }

  private calculateRecoveryScore(): number {
    const recentExperiments = this.experimentHistory.slice(-5);
    if (recentExperiments.length === 0) return 75;
    
    const completedExperiments = recentExperiments.filter(exp => 
      exp.result.status === 'completed'
    );
    
    return (completedExperiments.length / recentExperiments.length) * 100;
  }

  private getSystemStatus(metrics: SystemMetrics): 'healthy' | 'warning' | 'critical' {
    if (metrics.errorRate > 0.1 || metrics.memory.percentage > 90) {
      return 'critical';
    }
    if (metrics.errorRate > 0.05 || metrics.memory.percentage > 80) {
      return 'warning';
    }
    return 'healthy';
  }

  private getAverageResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    return this.responseTimes.reduce((a, b) => a + b) / this.responseTimes.length;
  }

  private getErrorRate(): number {
    if (this.requestCount === 0) return 0;
    return this.errorCount / this.requestCount;
  }

  private getActiveExperimentCount(): number {
    return this.experimentHistory.filter(exp => 
      exp.result.status === 'running'
    ).length;
  }

  private startMonitoring(): void {
    setInterval(() => {
      this.requestCount = 0;
      this.errorCount = 0;
    }, 60000);
  }
}
