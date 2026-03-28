import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  ChaosExperimentConfig, 
  ExperimentStatus, 
  ExperimentResult, 
  ChaosIncident,
  AbortTrigger,
  RollbackStrategy
} from '../interfaces/chaos.interfaces';
import { StructuredLoggerService } from '../../logging/structured-logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ChaosEngineService implements OnModuleInit, OnModuleDestroy {
  private activeExperiments = new Map<string, ChaosExperimentConfig>();
  private experimentResults = new Map<string, ExperimentResult>();
  private abortTimers = new Map<string, NodeJS.Timeout>();
  private isShuttingDown = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: StructuredLoggerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.logger.log('Chaos Engine initialized', 'ChaosEngine');
    
    // Set up global safety monitoring
    this.setupGlobalMonitoring();
    
    // Register shutdown handlers
    process.on('SIGTERM', () => this.emergencyShutdown('SIGTERM'));
    process.on('SIGINT', () => this.emergencyShutdown('SIGINT'));
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    await this.abortAllExperiments('System shutdown');
  }

  async runExperiment(config: ChaosExperimentConfig): Promise<string> {
    if (this.isShuttingDown) {
      throw new Error('Cannot start experiment during system shutdown');
    }

    // Validate blast radius
    await this.validateBlastRadius(config);

    // Check for conflicts with active experiments
    await this.checkExperimentConflicts(config);

    const experimentId = this.generateExperimentId(config);
    
    this.logger.log(
      `Starting chaos experiment: ${config.name} (${experimentId})`,
      'ChaosEngine',
      { config, experimentId }
    );

    // Store active experiment
    this.activeExperiments.set(experimentId, config);

    // Initialize result tracking
    const result: ExperimentResult = {
      experimentId,
      status: ExperimentStatus.RUNNING,
      startTime: new Date(),
      metrics: {
        before: await this.collectMetricsSnapshot(),
        during: {} as any,
        after: {} as any
      },
      incidents: [],
      resilienceScore: 0,
      recommendations: []
    };
    this.experimentResults.set(experimentId, result);

    try {
      // Set up abort monitoring
      this.setupAbortMonitoring(experimentId, config);

      // Execute the chaos experiment
      await this.executeExperiment(experimentId, config);

      // Mark as completed
      result.status = ExperimentStatus.COMPLETED;
      result.endTime = new Date();

      // Collect post-experiment metrics
      result.metrics.after = await this.collectMetricsSnapshot();

      // Calculate resilience score
      result.resilienceScore = await this.calculateResilienceScore(result);

      // Generate recommendations
      result.recommendations = await this.generateRecommendations(result);

      this.logger.log(
        `Chaos experiment completed: ${config.name} (${experimentId})`,
        'ChaosEngine',
        { 
          experimentId, 
          duration: result.endTime.getTime() - result.startTime.getTime(),
          resilienceScore: result.resilienceScore,
          incidents: result.incidents.length
        }
      );

      this.eventEmitter.emit('chaos.experiment.completed', result);

      return experimentId;

    } catch (error) {
      result.status = ExperimentStatus.FAILED;
      result.endTime = new Date();
      
      this.logger.error(
        error,
        `Chaos experiment failed: ${config.name} (${experimentId})`,
        'ChaosEngine'
      );

      this.eventEmitter.emit('chaos.experiment.failed', { experimentId, error });
      throw error;
    }
  }

  async abortExperiment(experimentId: string, reason: string): Promise<void> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    this.logger.warn(
      `Aborting chaos experiment: ${experiment.name} (${experimentId}) - ${reason}`,
      'ChaosEngine'
    );

    const result = this.experimentResults.get(experimentId);
    if (result) {
      result.status = ExperimentStatus.ABORTED;
      result.endTime = new Date();
    }

    // Execute rollback strategy
    await this.executeRollback(experimentId, experiment.safeAbort.rollbackStrategy);

    // Clear abort timer
    const timer = this.abortTimers.get(experimentId);
    if (timer) {
      clearTimeout(timer);
      this.abortTimers.delete(experimentId);
    }

    // Remove from active experiments
    this.activeExperiments.delete(experimentId);

    this.eventEmitter.emit('chaos.experiment.aborted', { experimentId, reason });
  }

  async getExperimentStatus(experimentId: string): Promise<ExperimentResult | null> {
    return this.experimentResults.get(experimentId) || null;
  }

  async getActiveExperiments(): Promise<string[]> {
    return Array.from(this.activeExperiments.keys());
  }

  async getExperimentHistory(limit: number = 50): Promise<ExperimentResult[]> {
    const results = Array.from(this.experimentResults.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    
    return results.slice(0, limit);
  }

  private async executeExperiment(experimentId: string, config: ChaosExperimentConfig): Promise<void> {
    switch (config.type) {
      case 'chaos_monkey':
        return this.executeChaosMonkey(experimentId, config);
      case 'latency_injection':
        return this.executeLatencyInjection(experimentId, config);
      case 'database_failure':
        return this.executeDatabaseFailure(experimentId, config);
      case 'memory_stress':
        return this.executeMemoryStress(experimentId, config);
      case 'cpu_stress':
        return this.executeCpuStress(experimentId, config);
      default:
        throw new Error(`Unsupported experiment type: ${config.type}`);
    }
  }

  private async executeChaosMonkey(experimentId: string, config: ChaosExperimentConfig): Promise<void> {
    // Implementation for random instance termination
    this.logger.log(`Executing Chaos Monkey experiment`, 'ChaosEngine', { experimentId });
    
    // Simulate instance termination
    for (const service of config.target.services) {
      if (Math.random() < 0.3) { // 30% chance to terminate each service
        await this.simulateInstanceTermination(service, experimentId);
      }
    }

    // Wait for experiment duration
    if (config.schedule?.duration) {
      await this.sleep(config.schedule.duration * 1000);
    }
  }

  private async executeLatencyInjection(experimentId: string, config: ChaosExperimentConfig): Promise<void> {
    this.logger.log(`Executing latency injection experiment`, 'ChaosEngine', { experimentId });
    
    // Implementation for latency injection
    const latency = Math.random() * 1000 + 500; // 500-1500ms latency
    
    for (const dependency of config.target.dependencies || []) {
      await this.injectLatency(dependency, latency, experimentId);
    }

    if (config.schedule?.duration) {
      await this.sleep(config.schedule.duration * 1000);
    }
  }

  private async executeDatabaseFailure(experimentId: string, config: ChaosExperimentConfig): Promise<void> {
    this.logger.log(`Executing database failure experiment`, 'ChaosEngine', { experimentId });
    
    // Simulate database connection issues
    await this.simulateDatabaseFailure('primary', experimentId);

    if (config.schedule?.duration) {
      await this.sleep(config.schedule.duration * 1000);
    }
  }

  private async executeMemoryStress(experimentId: string, config: ChaosExperimentConfig): Promise<void> {
    this.logger.log(`Executing memory stress experiment`, 'ChaosEngine', { experimentId });
    
    // Allocate memory to stress the system
    const memoryBuffers = [];
    const targetMemory = 1024 * 1024 * 1024; // 1GB
    
    try {
      while (process.memoryUsage().heapUsed < targetMemory) {
        memoryBuffers.push(Buffer.alloc(1024 * 1024)); // 1MB chunks
        await this.sleep(100);
      }
    } catch (error) {
      this.logger.warn(`Memory stress limit reached`, 'ChaosEngine', { experimentId, error });
    }

    if (config.schedule?.duration) {
      await this.sleep(config.schedule.duration * 1000);
    }

    // Clean up memory
    memoryBuffers.length = 0;
    if (global.gc) {
      global.gc();
    }
  }

  private async executeCpuStress(experimentId: string, config: ChaosExperimentConfig): Promise<void> {
    this.logger.log(`Executing CPU stress experiment`, 'ChaosEngine', { experimentId });
    
    const startTime = Date.now();
    const duration = config.schedule?.duration || 60; // Default 60 seconds
    
    // CPU intensive computation
    while (Date.now() - startTime < duration * 1000) {
      Math.random() * Math.random();
    }
  }

  private async simulateInstanceTermination(service: string, experimentId: string): Promise<void> {
    const incident: ChaosIncident = {
      id: this.generateIncidentId(),
      type: 'service_unavailable',
      severity: 'high',
      timestamp: new Date(),
      description: `Service ${service} terminated by Chaos Monkey`,
      affectedServices: [service],
      resolved: false
    };

    await this.recordIncident(experimentId, incident);
    
    this.logger.warn(
      `Simulated termination of service: ${service}`,
      'ChaosEngine',
      { experimentId, incidentId: incident.id }
    );
  }

  private async injectLatency(dependency: string, latencyMs: number, experimentId: string): Promise<void> {
    this.logger.log(
      `Injecting ${latencyMs}ms latency into dependency: ${dependency}`,
      'ChaosEngine',
      { experimentId }
    );

    // Simulate latency
    await this.sleep(latencyMs);
  }

  private async simulateDatabaseFailure(dbType: string, experimentId: string): Promise<void> {
    const incident: ChaosIncident = {
      id: this.generateIncidentId(),
      type: 'database_connection_failed',
      severity: 'critical',
      timestamp: new Date(),
      description: `${dbType} database connection failure simulated`,
      affectedServices: ['database'],
      resolved: false
    };

    await this.recordIncident(experimentId, incident);
    
    this.logger.error(
      new Error('Database connection failed'),
      `Simulated ${dbType} database failure`,
      'ChaosEngine',
      { experimentId, incidentId: incident.id }
    );
  }

  private async recordIncident(experimentId: string, incident: ChaosIncident): Promise<void> {
    const result = this.experimentResults.get(experimentId);
    if (result) {
      result.incidents.push(incident);
    }
  }

  private async setupAbortMonitoring(experimentId: string, config: ChaosExperimentConfig): Promise<void> {
    if (!config.safeAbort.enabled) return;

    for (const trigger of config.safeAbort.triggers) {
      const timer = setInterval(async () => {
        const shouldAbort = await this.checkAbortTrigger(trigger, experimentId);
        if (shouldAbort) {
          await this.abortExperiment(experimentId, `Abort trigger: ${trigger.type} exceeded threshold`);
        }
      }, trigger.window * 1000);

      this.abortTimers.set(`${experimentId}_${trigger.type}`, timer);
    }
  }

  private async checkAbortTrigger(trigger: AbortTrigger, experimentId: string): Promise<boolean> {
    const metrics = await this.collectMetricsSnapshot();
    
    switch (trigger.type) {
      case 'error_rate':
        return metrics.errorRate > trigger.threshold;
      case 'latency':
        return metrics.avgLatency > trigger.threshold;
      case 'cpu_usage':
        return metrics.cpuUsage > trigger.threshold;
      case 'memory_usage':
        return metrics.memoryUsage > trigger.threshold;
      default:
        return false;
    }
  }

  private async executeRollback(experimentId: string, strategy: RollbackStrategy): Promise<void> {
    this.logger.log(`Executing rollback strategy: ${strategy}`, 'ChaosEngine', { experimentId });

    switch (strategy) {
      case RollbackStrategy.IMMEDIATE:
        // Immediate rollback - stop all chaos activities
        break;
      case RollbackStrategy.GRACEFUL:
        // Graceful rollback - allow in-flight requests to complete
        await this.sleep(5000);
        break;
      case RollbackStrategy.MANUAL:
        // Manual rollback - require human intervention
        this.logger.warn(`Manual rollback required for experiment: ${experimentId}`, 'ChaosEngine');
        break;
    }
  }

  private async validateBlastRadius(config: ChaosExperimentConfig): Promise<void> {
    // Validate that blast radius constraints are respected
    if (config.target.services.length > config.blastRadius.maxAffectedServices) {
      throw new Error(`Target services (${config.target.services.length}) exceed blast radius limit (${config.blastRadius.maxAffectedServices})`);
    }

    // Check for critical services
    if (config.blastRadius.excludeCriticalServices) {
      const criticalServices = ['auth', 'database', 'payment'];
      const hasCriticalService = config.target.services.some(service => 
        criticalServices.includes(service.toLowerCase())
      );
      
      if (hasCriticalService) {
        throw new Error('Experiment targets critical services which are excluded by blast radius config');
      }
    }
  }

  private async checkExperimentConflicts(config: ChaosExperimentConfig): Promise<void> {
    for (const [activeId, activeConfig] of this.activeExperiments) {
      // Check for overlapping targets
      const hasOverlap = config.target.services.some(service => 
        activeConfig.target.services.includes(service)
      );

      if (hasOverlap) {
        throw new Error(`Experiment conflicts with active experiment: ${activeId}`);
      }
    }
  }

  private setupGlobalMonitoring(): void {
    // Set up system-wide monitoring for safety
    setInterval(async () => {
      const metrics = await this.collectMetricsSnapshot();
      
      // Emergency abort if system is under stress
      if (metrics.cpuUsage > 90 || metrics.memoryUsage > 90) {
        this.logger.warn(
          `System under stress, aborting all experiments`,
          'ChaosEngine',
          { cpuUsage: metrics.cpuUsage, memoryUsage: metrics.memoryUsage }
        );
        await this.abortAllExperiments('System stress threshold exceeded');
      }
    }, 10000); // Check every 10 seconds
  }

  private async abortAllExperiments(reason: string): Promise<void> {
    const activeIds = Array.from(this.activeExperiments.keys());
    
    await Promise.all(
      activeIds.map(id => this.abortExperiment(id, reason).catch(err => 
        this.logger.error(err, `Failed to abort experiment ${id}`, 'ChaosEngine')
      ))
    );
  }

  private async emergencyShutdown(signal: string): Promise<void> {
    this.isShuttingDown = true;
    await this.abortAllExperiments(`Emergency shutdown: ${signal}`);
  }

  private async collectMetricsSnapshot(): Promise<any> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      timestamp: new Date(),
      errorRate: Math.random() * 5, // Simulated error rate
      avgLatency: Math.random() * 200 + 50, // Simulated latency
      p95Latency: Math.random() * 500 + 100,
      p99Latency: Math.random() * 1000 + 200,
      throughput: Math.random() * 1000 + 500,
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      activeConnections: Math.floor(Math.random() * 100)
    };
  }

  private async calculateResilienceScore(result: ExperimentResult): Promise<number> {
    // Simple resilience scoring algorithm
    let score = 100;
    
    // Deduct points for incidents
    result.incidents.forEach(incident => {
      switch (incident.severity) {
        case 'critical':
          score -= 30;
          break;
        case 'high':
          score -= 20;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    });
    
    // Deduct points for duration (longer experiments indicate slower recovery)
    const duration = result.endTime!.getTime() - result.startTime.getTime();
    if (duration > 60000) { // More than 1 minute
      score -= 10;
    }
    
    return Math.max(0, score);
  }

  private async generateRecommendations(result: ExperimentResult): Promise<string[]> {
    const recommendations: string[] = [];
    
    if (result.incidents.some(i => i.type === 'service_unavailable')) {
      recommendations.push('Implement service redundancy and failover mechanisms');
    }
    
    if (result.incidents.some(i => i.type === 'database_connection_failed')) {
      recommendations.push('Add database connection pooling and retry logic');
    }
    
    if (result.metrics.during.avgLatency > 1000) {
      recommendations.push('Optimize service performance and add caching');
    }
    
    if (result.resilienceScore < 70) {
      recommendations.push('Review and improve overall system resilience');
    }
    
    return recommendations;
  }

  private generateExperimentId(config: ChaosExperimentConfig): string {
    const timestamp = Date.now();
    const hash = Math.random().toString(36).substring(2, 8);
    return `${config.type}_${timestamp}_${hash}`;
  }

  private generateIncidentId(): string {
    return `inc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
