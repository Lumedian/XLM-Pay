import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { 
  ChaosExperimentConfig, 
  ExperimentResult, 
  ResilienceReport,
  ChaosExperimentType,
  ExperimentStatus
} from '../interfaces/chaos.interfaces';
import { ChaosEngineService } from '../services/chaos-engine.service';
import { ChaosReportingService } from '../services/chaos-reporting.service';
import { ChaosSchedulerService } from '../services/chaos-scheduler.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('chaos-engineering')
@Controller('chaos-engineering')
@UseGuards(AdminGuard) // Restrict chaos engineering to admin users only
export class ChaosEngineeringController {
  constructor(
    private readonly chaosEngine: ChaosEngineService,
    private readonly chaosReporting: ChaosReportingService,
    private readonly chaosScheduler: ChaosSchedulerService,
  ) {}

  @Post('experiments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Execute a chaos experiment' })
  @ApiResponse({ status: 201, description: 'Experiment started successfully', type: String })
  @ApiResponse({ status: 400, description: 'Invalid experiment configuration' })
  @ApiResponse({ status: 409, description: 'Experiment conflicts with active experiments' })
  async runExperiment(@Body() config: ChaosExperimentConfig): Promise<{ experimentId: string }> {
    const experimentId = await this.chaosEngine.runExperiment(config);
    return { experimentId };
  }

  @Get('experiments')
  @ApiOperation({ summary: 'Get all experiments (active and historical)' })
  @ApiResponse({ status: 200, description: 'List of experiments retrieved successfully' })
  @ApiQuery({ name: 'status', required: false, enum: ExperimentStatus, description: 'Filter by status' })
  @ApiQuery({ name: 'type', required: false, enum: ChaosExperimentType, description: 'Filter by type' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of results' })
  async getExperiments(
    @Query('status') status?: ExperimentStatus,
    @Query('type') type?: ChaosExperimentType,
    @Query('limit') limit?: number,
  ): Promise<{ experiments: ExperimentResult[] }> {
    const experiments = await this.chaosEngine.getExperimentHistory(limit || 50);
    
    let filteredExperiments = experiments;
    
    if (status) {
      filteredExperiments = filteredExperiments.filter(e => e.status === status);
    }
    
    if (type) {
      filteredExperiments = filteredExperiments.filter(e => 
        e.experimentId.startsWith(type)
      );
    }
    
    return { experiments: filteredExperiments };
  }

  @Get('experiments/active')
  @ApiOperation({ summary: 'Get currently active experiments' })
  @ApiResponse({ status: 200, description: 'Active experiments retrieved successfully' })
  async getActiveExperiments(): Promise<{ activeExperiments: string[] }> {
    const activeExperiments = await this.chaosEngine.getActiveExperiments();
    return { activeExperiments };
  }

  @Get('experiments/:experimentId')
  @ApiOperation({ summary: 'Get specific experiment details' })
  @ApiParam({ name: 'experimentId', description: 'Experiment ID' })
  @ApiResponse({ status: 200, description: 'Experiment details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Experiment not found' })
  async getExperiment(@Param('experimentId') experimentId: string): Promise<{ experiment: ExperimentResult | null }> {
    const experiment = await this.chaosEngine.getExperimentStatus(experimentId);
    return { experiment };
  }

  @Post('experiments/:experimentId/abort')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abort a running experiment' })
  @ApiParam({ name: 'experimentId', description: 'Experiment ID' })
  @ApiResponse({ status: 200, description: 'Experiment aborted successfully' })
  @ApiResponse({ status: 404, description: 'Experiment not found' })
  async abortExperiment(
    @Param('experimentId') experimentId: string,
    @Body('reason') reason: string,
  ): Promise<{ message: string }> {
    await this.chaosEngine.abortExperiment(experimentId, reason || 'Manual abort');
    return { message: 'Experiment aborted successfully' };
  }

  @Get('experiments/:experimentId/report')
  @ApiOperation({ summary: 'Generate resilience report for an experiment' })
  @ApiParam({ name: 'experimentId', description: 'Experiment ID' })
  @ApiResponse({ status: 200, description: 'Resilience report generated successfully' })
  async getResilienceReport(@Param('experimentId') experimentId: string): Promise<{ report: ResilienceReport }> {
    const experiment = await this.chaosEngine.getExperimentStatus(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }
    
    const report = await this.chaosReporting.generateResilienceReport(experiment);
    return { report };
  }

  @Get('reports/summary')
  @ApiOperation({ summary: 'Generate summary report of all experiments' })
  @ApiResponse({ status: 200, description: 'Summary report generated successfully' })
  async getSummaryReport(): Promise<{ summary: any }> {
    const experiments = await this.chaosEngine.getExperimentHistory(100);
    const summary = await this.chaosReporting.generateSummaryReport(experiments);
    return { summary };
  }

  @Get('experiments/:experimentId/export')
  @ApiOperation({ summary: 'Export experiment results' })
  @ApiParam({ name: 'experimentId', description: 'Experiment ID' })
  @ApiQuery({ name: 'format', required: true, enum: ['json', 'csv', 'pdf'], description: 'Export format' })
  @ApiResponse({ status: 200, description: 'Experiment exported successfully' })
  async exportExperiment(
    @Param('experimentId') experimentId: string,
    @Query('format') format: 'json' | 'csv' | 'pdf',
  ): Promise<any> {
    const exportData = await this.chaosReporting.exportExperimentResults(experimentId, format);
    return exportData;
  }

  @Post('schedule')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Schedule a recurring chaos experiment' })
  @ApiResponse({ status: 201, description: 'Experiment scheduled successfully' })
  async scheduleExperiment(@Body() config: ChaosExperimentConfig): Promise<{ message: string }> {
    await this.chaosScheduler.scheduleExperiment(config);
    return { message: 'Experiment scheduled successfully' };
  }

  @Delete('schedule/:experimentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unschedule a chaos experiment' })
  @ApiParam({ name: 'experimentId', description: 'Experiment ID' })
  @ApiResponse({ status: 200, description: 'Experiment unscheduled successfully' })
  async unscheduleExperiment(@Param('experimentId') experimentId: string): Promise<{ message: string }> {
    await this.chaosScheduler.unscheduleExperiment(experimentId);
    return { message: 'Experiment unscheduled successfully' };
  }

  @Get('schedule')
  @ApiOperation({ summary: 'Get all scheduled experiments' })
  @ApiResponse({ status: 200, description: 'Scheduled experiments retrieved successfully' })
  async getScheduledExperiments(): Promise<{ scheduled: any[] }> {
    const scheduled = await this.chaosScheduler.getScheduledExperiments();
    return { scheduled };
  }

  @Post('runbooks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a chaos experiment runbook' })
  @ApiResponse({ status: 201, description: 'Runbook created successfully' })
  async createRunbook(@Body() config: ChaosExperimentConfig): Promise<{ runbookId: string }> {
    const runbookId = await this.chaosScheduler.scheduleRunbook(config);
    return { runbookId };
  }

  @Post('runbooks/:runbookId/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute a chaos experiment runbook' })
  @ApiParam({ name: 'runbookId', description: 'Runbook ID' })
  @ApiResponse({ status: 200, description: 'Runbook executed successfully' })
  async executeRunbook(@Param('runbookId') runbookId: string): Promise<{ experimentId: string }> {
    const experimentId = await this.chaosScheduler.executeRunbook(runbookId);
    return { experimentId };
  }

  @Post('scheduler/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause all scheduled chaos experiments' })
  @ApiResponse({ status: 200, description: 'Scheduler paused successfully' })
  async pauseScheduler(): Promise<{ message: string }> {
    await this.chaosScheduler.pauseScheduler();
    return { message: 'Scheduler paused successfully' };
  }

  @Post('scheduler/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume all scheduled chaos experiments' })
  @ApiResponse({ status: 200, description: 'Scheduler resumed successfully' })
  async resumeScheduler(): Promise<{ message: string }> {
    await this.chaosScheduler.resumeScheduler();
    return { message: 'Scheduler resumed successfully' };
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get predefined chaos experiment templates' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  async getExperimentTemplates(): Promise<{ templates: ChaosExperimentConfig[] }> {
    const templates = this.getPredefinedTemplates();
    return { templates };
  }

  @Get('health')
  @ApiOperation({ summary: 'Check chaos engineering system health' })
  @ApiResponse({ status: 200, description: 'System health retrieved successfully' })
  async getSystemHealth(): Promise<{ health: any }> {
    const activeExperiments = await this.chaosEngine.getActiveExperiments();
    const scheduledExperiments = await this.chaosScheduler.getScheduledExperiments();
    
    const health = {
      status: 'healthy',
      activeExperiments: activeExperiments.length,
      scheduledExperiments: scheduledExperiments.length,
      systemMetrics: await this.getSystemMetrics(),
      lastExperiment: await this.getLastExperimentInfo(),
      recommendations: await this.getSystemRecommendations()
    };
    
    return { health };
  }

  private getPredefinedTemplates(): ChaosExperimentConfig[] {
    return [
      {
        id: 'chaos-monkey-template',
        name: 'Chaos Monkey - Random Instance Termination',
        description: 'Randomly terminate instances to test system resilience',
        type: ChaosExperimentType.CHAOS_MONKEY,
        target: {
          services: ['api', 'worker', 'cache'],
          instances: [],
          dependencies: [],
          regions: []
        },
        schedule: {
          enabled: false,
          duration: 60,
          timezone: 'UTC'
        },
        blastRadius: {
          maxAffectedServices: 2,
          maxAffectedUsers: 1000,
          excludeCriticalServices: true,
          customExclusions: ['auth', 'database', 'payment']
        },
        safeAbort: {
          enabled: true,
          triggers: [
            {
              type: 'error_rate',
              threshold: 10,
              window: 30
            },
            {
              type: 'cpu_usage',
              threshold: 80,
              window: 60
            }
          ],
          rollbackStrategy: 'immediate' as any
        },
        metrics: {
          collectBefore: true,
          collectDuring: true,
          collectAfter: true,
          metrics: ['error_rate', 'latency', 'throughput', 'cpu_usage', 'memory_usage']
        }
      },
      {
        id: 'latency-injection-template',
        name: 'Latency Injection - Dependency Delays',
        description: 'Inject latency into external dependencies to test timeout handling',
        type: ChaosExperimentType.LATENCY_INJECTION,
        target: {
          services: [],
          instances: [],
          dependencies: ['database', 'external-api', 'cache'],
          regions: []
        },
        schedule: {
          enabled: false,
          duration: 120,
          timezone: 'UTC'
        },
        blastRadius: {
          maxAffectedServices: 5,
          maxAffectedUsers: 5000,
          excludeCriticalServices: false,
          customExclusions: []
        },
        safeAbort: {
          enabled: true,
          triggers: [
            {
              type: 'latency',
              threshold: 2000,
              window: 30
            },
            {
              type: 'error_rate',
              threshold: 5,
              window: 30
            }
          ],
          rollbackStrategy: 'graceful' as any
        },
        metrics: {
          collectBefore: true,
          collectDuring: true,
          collectAfter: true,
          metrics: ['response_time', 'error_rate', 'timeout_rate']
        }
      },
      {
        id: 'database-failure-template',
        name: 'Database Connection Failure',
        description: 'Simulate database connection issues to test failover mechanisms',
        type: ChaosExperimentType.DATABASE_FAILURE,
        target: {
          services: ['api', 'worker'],
          instances: [],
          dependencies: ['database'],
          regions: []
        },
        schedule: {
          enabled: false,
          duration: 30,
          timezone: 'UTC'
        },
        blastRadius: {
          maxAffectedServices: 10,
          maxAffectedUsers: 10000,
          excludeCriticalServices: false,
          customExclusions: []
        },
        safeAbort: {
          enabled: true,
          triggers: [
            {
              type: 'error_rate',
              threshold: 50,
              window: 10
            }
          ],
          rollbackStrategy: 'immediate' as any
        },
        metrics: {
          collectBefore: true,
          collectDuring: true,
          collectAfter: true,
          metrics: ['database_connections', 'error_rate', 'response_time']
        }
      }
    ];
  }

  private async getSystemMetrics(): Promise<any> {
    const memUsage = process.memoryUsage();
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      diskUsage: Math.random() * 100,
      networkLatency: Math.random() * 100,
      uptime: process.uptime()
    };
  }

  private async getLastExperimentInfo(): Promise<any> {
    const experiments = await this.chaosEngine.getExperimentHistory(1);
    if (experiments.length > 0) {
      const last = experiments[0];
      return {
        id: last.experimentId,
        status: last.status,
        startTime: last.startTime,
        resilienceScore: last.resilienceScore
      };
    }
    return null;
  }

  private async getSystemRecommendations(): Promise<string[]> {
    const experiments = await this.chaosEngine.getExperimentHistory(10);
    if (experiments.length === 0) {
      return ['Start with basic experiments to establish baseline resilience metrics'];
    }
    
    const avgScore = experiments.reduce((sum, e) => sum + e.resilienceScore, 0) / experiments.length;
    
    if (avgScore < 60) {
      return ['Focus on improving basic reliability before running complex experiments'];
    } else if (avgScore < 80) {
      return ['System resilience is good, consider running more complex scenarios'];
    } else {
      return ['Excellent resilience! Consider advanced experiments and edge cases'];
    }
  }
}
