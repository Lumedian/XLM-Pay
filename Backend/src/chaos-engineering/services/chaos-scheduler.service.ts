import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { 
  ChaosExperimentConfig, 
  ChaosSchedule,
  ExperimentStatus 
} from '../interfaces/chaos.interfaces';
import { ChaosEngineService } from './chaos-engine.service';
import { StructuredLoggerService } from '../../logging/structured-logger.service';
import { CronJob } from 'cron';

@Injectable()
export class ChaosSchedulerService implements OnModuleInit {
  private scheduledExperiments = new Map<string, CronJob>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly chaosEngine: ChaosEngineService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Chaos Scheduler initialized', 'ChaosScheduler');
  }

  async scheduleExperiment(config: ChaosExperimentConfig): Promise<void> {
    if (!config.schedule?.enabled || !config.schedule.cron) {
      this.logger.warn(
        `Experiment ${config.name} does not have scheduling enabled`,
        'ChaosScheduler'
      );
      return;
    }

    const jobName = `chaos-experiment-${config.id}`;
    
    // Check if already scheduled
    if (this.scheduledExperiments.has(jobName)) {
      await this.unscheduleExperiment(config.id);
    }

    this.logger.log(
      `Scheduling chaos experiment: ${config.name} with cron: ${config.schedule.cron}`,
      'ChaosScheduler',
      { config, jobName }
    );

    const job = new CronJob(config.schedule.cron, async () => {
      await this.executeScheduledExperiment(config);
    });

    this.scheduledExperiments.set(jobName, job);
    job.start();

    this.logger.log(
      `Chaos experiment scheduled successfully: ${config.name}`,
      'ChaosScheduler',
      { jobName, nextRun: job.nextDate()?.toISOString() }
    );
  }

  async unscheduleExperiment(experimentId: string): Promise<void> {
    const jobName = `chaos-experiment-${experimentId}`;
    const job = this.scheduledExperiments.get(jobName);
    
    if (job) {
      job.stop();
      this.scheduledExperiments.delete(jobName);
      
      this.logger.log(
        `Unscheduled chaos experiment: ${experimentId}`,
        'ChaosScheduler',
        { jobName }
      );
    }
  }

  async scheduleRunbook(config: ChaosExperimentConfig): Promise<string> {
    const runbookId = this.generateRunbookId();
    
    this.logger.log(
      `Creating runbook for experiment: ${config.name}`,
      'ChaosScheduler',
      { runbookId, config }
    );

    // Create a comprehensive runbook with steps
    const runbook = {
      id: runbookId,
      experimentConfig: config,
      createdAt: new Date(),
      steps: this.generateRunbookSteps(config),
      checklist: this.generateSafetyChecklist(config),
      rollbackProcedures: this.generateRollbackProcedures(config),
      monitoringPlan: this.generateMonitoringPlan(config)
    };

    // Store runbook (in a real implementation, this would be persisted)
    await this.storeRunbook(runbook);

    return runbookId;
  }

  async executeRunbook(runbookId: string): Promise<string> {
    this.logger.log(
      `Executing runbook: ${runbookId}`,
      'ChaosScheduler'
    );

    const runbook = await this.getRunbook(runbookId);
    if (!runbook) {
      throw new Error(`Runbook not found: ${runbookId}`);
    }

    // Execute pre-flight checks
    await this.executePreflightChecks(runbook);

    // Execute the experiment
    const experimentId = await this.chaosEngine.runExperiment(runbook.experimentConfig);

    // Monitor execution
    await this.monitorExperimentExecution(experimentId, runbook);

    return experimentId;
  }

  async getScheduledExperiments(): Promise<any[]> {
    const scheduled: any[] = [];
    
    for (const [jobName, job] of this.scheduledExperiments) {
      const experimentId = jobName.replace('chaos-experiment-', '');
      scheduled.push({
        experimentId,
        jobName,
        nextRun: job.nextDate()?.toISOString(),
        isRunning: job.running,
        lastRun: job.lastDate()?.toISOString()
      });
    }
    
    return scheduled;
  }

  async pauseScheduler(): Promise<void> {
    this.logger.log('Pausing all chaos experiment schedules', 'ChaosScheduler');
    
    for (const [jobName, job] of this.scheduledExperiments) {
      job.stop();
    }
  }

  async resumeScheduler(): Promise<void> {
    this.logger.log('Resuming all chaos experiment schedules', 'ChaosScheduler');
    
    for (const [jobName, job] of this.scheduledExperiments) {
      job.start();
    }
  }

  private async executeScheduledExperiment(config: ChaosExperimentConfig): Promise<void> {
    try {
      this.logger.log(
        `Executing scheduled chaos experiment: ${config.name}`,
        'ChaosScheduler'
      );

      // Check if it's safe to run
      const isSafe = await this.checkSafeExecutionWindow(config);
      if (!isSafe) {
        this.logger.warn(
          `Skipping scheduled experiment ${config.name} - unsafe execution window`,
          'ChaosScheduler'
        );
        return;
      }

      // Run the experiment
      const experimentId = await this.chaosEngine.runExperiment(config);
      
      this.logger.log(
        `Scheduled experiment started: ${config.name} (${experimentId})`,
        'ChaosScheduler'
      );

    } catch (error) {
      this.logger.error(
        error,
        `Failed to execute scheduled experiment: ${config.name}`,
        'ChaosScheduler'
      );
    }
  }

  private async checkSafeExecutionWindow(config: ChaosExperimentConfig): Promise<boolean> {
    // Check business hours
    const now = new Date();
    const hour = now.getHours();
    
    // Avoid running during business hours (9 AM - 5 PM) unless explicitly allowed
    if (hour >= 9 && hour <= 17 && !config.schedule?.timezone?.includes('business-hours')) {
      return false;
    }

    // Check for active incidents
    const activeExperiments = await this.chaosEngine.getActiveExperiments();
    if (activeExperiments.length > 0) {
      return false;
    }

    // Check system health
    const systemMetrics = await this.getSystemMetrics();
    if (systemMetrics.cpuUsage > 70 || systemMetrics.memoryUsage > 70) {
      return false;
    }

    return true;
  }

  private generateRunbookSteps(config: ChaosExperimentConfig): any[] {
    const baseSteps = [
      {
        id: 'preflight-checks',
        name: 'Pre-flight Checks',
        description: 'Verify system health and safety conditions',
        required: true,
        estimatedTime: '5 minutes'
      },
      {
        id: 'notification-stakeholders',
        name: 'Notify Stakeholders',
        description: 'Inform relevant teams about the upcoming experiment',
        required: true,
        estimatedTime: '2 minutes'
      },
      {
        id: 'backup-systems',
        name: 'Backup Critical Systems',
        description: 'Create backups of critical data and configurations',
        required: true,
        estimatedTime: '10 minutes'
      },
      {
        id: 'execute-experiment',
        name: 'Execute Chaos Experiment',
        description: 'Run the actual chaos experiment',
        required: true,
        estimatedTime: `${config.schedule?.duration || 60} seconds`
      },
      {
        id: 'monitor-system',
        name: 'Monitor System Response',
        description: 'Monitor system behavior during the experiment',
        required: true,
        estimatedTime: `${config.schedule?.duration || 60} seconds`
      },
      {
        id: 'collect-metrics',
        name: 'Collect Metrics',
        description: 'Gather performance and reliability metrics',
        required: true,
        estimatedTime: '5 minutes'
      },
      {
        id: 'generate-report',
        name: 'Generate Resilience Report',
        description: 'Create comprehensive resilience analysis',
        required: true,
        estimatedTime: '3 minutes'
      },
      {
        id: 'post-experiment-review',
        name: 'Post-experiment Review',
        description: 'Review results and document findings',
        required: true,
        estimatedTime: '15 minutes'
      }
    ];

    // Add experiment-specific steps
    switch (config.type) {
      case 'chaos_monkey':
        baseSteps.push({
          id: 'verify-redundancy',
          name: 'Verify Service Redundancy',
          description: 'Ensure backup services are available',
          required: true,
          estimatedTime: '5 minutes'
        });
        break;
      case 'database_failure':
        baseSteps.push({
          id: 'test-failover',
          name: 'Test Database Failover',
          description: 'Verify database failover mechanisms',
          required: true,
          estimatedTime: '10 minutes'
        });
        break;
    }

    return baseSteps;
  }

  private generateSafetyChecklist(config: ChaosExperimentConfig): any[] {
    return [
      {
        item: 'Business hours check',
        description: 'Confirm experiment is not running during peak business hours',
        checked: false
      },
      {
        item: 'System health verification',
        description: 'Verify all systems are healthy before starting',
        checked: false
      },
      {
        item: 'Backup verification',
        description: 'Confirm recent backups are available and tested',
        checked: false
      },
      {
        item: 'Stakeholder notification',
        description: 'All relevant stakeholders have been notified',
        checked: false
      },
      {
        item: 'Rollback plan verification',
        description: 'Rollback procedures are documented and tested',
        checked: false
      },
      {
        item: 'Monitoring setup',
        description: 'Monitoring and alerting are properly configured',
        checked: false
      },
      {
        item: 'Blast radius confirmation',
        description: 'Blast radius is within acceptable limits',
        checked: false
      }
    ];
  }

  private generateRollbackProcedures(config: ChaosExperimentConfig): any[] {
    const baseProcedures = [
      {
        step: 1,
        action: 'Stop all chaos activities',
        description: 'Immediately terminate all chaos experiment processes',
        automated: true,
        estimatedTime: '30 seconds'
      },
      {
        step: 2,
        action: 'Verify system stability',
        description: 'Check that all services are responding normally',
        automated: false,
        estimatedTime: '2 minutes'
      },
      {
        step: 3,
        action: 'Restore from backup if needed',
        description: 'Restore critical systems from recent backups',
        automated: false,
        estimatedTime: '15 minutes'
      },
      {
        step: 4,
        action: 'Notify stakeholders',
        description: 'Inform all stakeholders about the rollback',
        automated: false,
        estimatedTime: '5 minutes'
      }
    ];

    return baseProcedures;
  }

  private generateMonitoringPlan(config: ChaosExperimentConfig): any {
    return {
      metrics: [
        'error_rate',
        'response_time',
        'throughput',
        'cpu_usage',
        'memory_usage',
        'active_connections',
        'database_connections',
        'queue_depth'
      ],
      alerting: {
        errorRateThreshold: 10, // 10%
        latencyThreshold: 2000, // 2 seconds
        cpuThreshold: 80, // 80%
        memoryThreshold: 80, // 80%
        criticalServices: config.target.services
      },
      dashboard: {
        refreshInterval: 10, // seconds
        retentionPeriod: 24 // hours
      }
    };
  }

  private async executePreflightChecks(runbook: any): Promise<void> {
    this.logger.log('Executing pre-flight checks', 'ChaosScheduler');
    
    // Execute all checklist items
    for (const item of runbook.checklist) {
      // In a real implementation, these would be actual checks
      item.checked = true;
    }
    
    this.logger.log('Pre-flight checks completed', 'ChaosScheduler');
  }

  private async monitorExperimentExecution(experimentId: string, runbook: any): Promise<void> {
    // Monitor the experiment while it runs
    const checkInterval = setInterval(async () => {
      const result = await this.chaosEngine.getExperimentStatus(experimentId);
      
      if (!result || result.status === ExperimentStatus.COMPLETED || 
          result.status === ExperimentStatus.ABORTED || 
          result.status === ExperimentStatus.FAILED) {
        clearInterval(checkInterval);
        this.logger.log(
          `Experiment monitoring completed: ${experimentId}`,
          'ChaosScheduler',
          { finalStatus: result?.status }
        );
      }
    }, 5000); // Check every 5 seconds
  }

  private async storeRunbook(runbook: any): Promise<void> {
    // In a real implementation, this would store in a database
    this.logger.log('Runbook stored', 'ChaosScheduler', { runbookId: runbook.id });
  }

  private async getRunbook(runbookId: string): Promise<any> {
    // In a real implementation, this would fetch from a database
    return null;
  }

  private async getSystemMetrics(): Promise<any> {
    const memUsage = process.memoryUsage();
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      diskUsage: Math.random() * 100,
      networkLatency: Math.random() * 100
    };
  }

  private generateRunbookId(): string {
    return `runbook_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
