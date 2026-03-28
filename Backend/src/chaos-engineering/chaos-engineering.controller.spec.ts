import { Test, TestingModule } from '@nestjs/testing';
import { ChaosEngineeringController } from '../chaos-engineering.controller';
import { ChaosEngineService } from '../services/chaos-engine.service';
import { ChaosReportingService } from '../services/chaos-reporting.service';
import { ChaosSchedulerService } from '../services/chaos-scheduler.service';
import { 
  ChaosExperimentConfig,
  ChaosExperimentType,
  ExperimentStatus,
  ExperimentResult
} from '../interfaces/chaos.interfaces';

describe('ChaosEngineeringController', () => {
  let controller: ChaosEngineeringController;
  let chaosEngine: ChaosEngineService;
  let chaosReporting: ChaosReportingService;
  let chaosScheduler: ChaosSchedulerService;

  const mockChaosEngine = {
    runExperiment: jest.fn(),
    getExperimentStatus: jest.fn(),
    getActiveExperiments: jest.fn(),
    getExperimentHistory: jest.fn(),
    abortExperiment: jest.fn(),
  };

  const mockChaosReporting = {
    generateResilienceReport: jest.fn(),
    generateSummaryReport: jest.fn(),
    exportExperimentResults: jest.fn(),
  };

  const mockChaosScheduler = {
    scheduleExperiment: jest.fn(),
    unscheduleExperiment: jest.fn(),
    getScheduledExperiments: jest.fn(),
    scheduleRunbook: jest.fn(),
    executeRunbook: jest.fn(),
    pauseScheduler: jest.fn(),
    resumeScheduler: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChaosEngineeringController],
      providers: [
        {
          provide: ChaosEngineService,
          useValue: mockChaosEngine,
        },
        {
          provide: ChaosReportingService,
          useValue: mockChaosReporting,
        },
        {
          provide: ChaosSchedulerService,
          useValue: mockChaosScheduler,
        },
      ],
    }).compile();

    controller = module.get<ChaosEngineeringController>(ChaosEngineeringController);
    chaosEngine = module.get<ChaosEngineService>(ChaosEngineService);
    chaosReporting = module.get<ChaosReportingService>(ChaosReportingService);
    chaosScheduler = module.get<ChaosSchedulerService>(ChaosSchedulerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('runExperiment', () => {
    const validConfig: ChaosExperimentConfig = {
      id: 'test-experiment',
      name: 'Test Experiment',
      description: 'Test chaos experiment',
      type: ChaosExperimentType.CHAOS_MONKEY,
      target: {
        services: ['test-service'],
      },
      blastRadius: {
        maxAffectedServices: 1,
        maxAffectedUsers: 100,
        excludeCriticalServices: true,
        customExclusions: [],
      },
      safeAbort: {
        enabled: true,
        triggers: [],
        rollbackStrategy: 'immediate' as any,
      },
      metrics: {
        collectBefore: true,
        collectDuring: true,
        collectAfter: true,
        metrics: ['error_rate'],
      },
    };

    it('should successfully run a chaos experiment', async () => {
      const experimentId = 'exp-123';
      mockChaosEngine.runExperiment.mockResolvedValue(experimentId);

      const result = await controller.runExperiment(validConfig);

      expect(result).toEqual({ experimentId });
      expect(mockChaosEngine.runExperiment).toHaveBeenCalledWith(validConfig);
    });

    it('should handle experiment execution errors', async () => {
      const error = new Error('Invalid configuration');
      mockChaosEngine.runExperiment.mockRejectedValue(error);

      await expect(controller.runExperiment(validConfig)).rejects.toThrow(error);
    });
  });

  describe('getExperiments', () => {
    const mockExperiments: ExperimentResult[] = [
      {
        experimentId: 'exp-1',
        status: ExperimentStatus.COMPLETED,
        startTime: new Date(),
        endTime: new Date(),
        metrics: {} as any,
        incidents: [],
        resilienceScore: 85,
        recommendations: [],
      },
      {
        experimentId: 'exp-2',
        status: ExperimentStatus.RUNNING,
        startTime: new Date(),
        metrics: {} as any,
        incidents: [],
        resilienceScore: 0,
        recommendations: [],
      },
    ];

    it('should return all experiments without filters', async () => {
      mockChaosEngine.getExperimentHistory.mockResolvedValue(mockExperiments);

      const result = await controller.getExperiments();

      expect(result).toEqual({ experiments: mockExperiments });
      expect(mockChaosEngine.getExperimentHistory).toHaveBeenCalledWith(50);
    });

    it('should filter experiments by status', async () => {
      mockChaosEngine.getExperimentHistory.mockResolvedValue(mockExperiments);

      const result = await controller.getExperiments(null, null, null, ExperimentStatus.COMPLETED);

      expect(result).toEqual({
        experiments: [mockExperiments[0]]
      });
    });

    it('should filter experiments by type', async () => {
      mockChaosEngine.getExperimentHistory.mockResolvedValue(mockExperiments);

      const result = await controller.getExperiments(null, ChaosExperimentType.CHAOS_MONKEY, null, null);

      // Should filter by experimentId prefix
      expect(mockChaosEngine.getExperimentHistory).toHaveBeenCalledWith(50);
    });

    it('should limit results', async () => {
      mockChaosEngine.getExperimentHistory.mockResolvedValue(mockExperiments);

      const result = await controller.getExperiments(null, null, null, 10);

      expect(mockChaosEngine.getExperimentHistory).toHaveBeenCalledWith(10);
    });

    it('should handle empty experiment list', async () => {
      mockChaosEngine.getExperimentHistory.mockResolvedValue([]);

      const result = await controller.getExperiments();

      expect(result).toEqual({ experiments: [] });
    });
  });

  describe('getActiveExperiments', () => {
    it('should return active experiments', async () => {
      const activeExperiments = ['exp-1', 'exp-2'];
      mockChaosEngine.getActiveExperiments.mockResolvedValue(activeExperiments);

      const result = await controller.getActiveExperiments();

      expect(result).toEqual({ activeExperiments });
      expect(mockChaosEngine.getActiveExperiments).toHaveBeenCalled();
    });

    it('should handle no active experiments', async () => {
      mockChaosEngine.getActiveExperiments.mockResolvedValue([]);

      const result = await controller.getActiveExperiments();

      expect(result).toEqual({ activeExperiments: [] });
    });
  });

  describe('getExperiment', () => {
    const experimentId = 'test-experiment-123';
    const mockExperiment: ExperimentResult = {
      experimentId,
      status: ExperimentStatus.COMPLETED,
      startTime: new Date(),
      endTime: new Date(),
      metrics: {} as any,
      incidents: [],
      resilienceScore: 90,
      recommendations: [],
    };

    it('should return experiment details', async () => {
      mockChaosEngine.getExperimentStatus.mockResolvedValue(mockExperiment);

      const result = await controller.getExperiment(experimentId);

      expect(result).toEqual({ experiment: mockExperiment });
      expect(mockChaosEngine.getExperimentStatus).toHaveBeenCalledWith(experimentId);
    });

    it('should return null for non-existent experiment', async () => {
      mockChaosEngine.getExperimentStatus.mockResolvedValue(null);

      const result = await controller.getExperiment('non-existent');

      expect(result).toEqual({ experiment: null });
    });
  });

  describe('abortExperiment', () => {
    const experimentId = 'test-experiment-123';
    const reason = 'Manual abort for testing';

    it('should abort an experiment', async () => {
      mockChaosEngine.abortExperiment.mockResolvedValue(undefined);

      const result = await controller.abortExperiment(experimentId, reason);

      expect(result).toEqual({ message: 'Experiment aborted successfully' });
      expect(mockChaosEngine.abortExperiment).toHaveBeenCalledWith(experimentId, reason);
    });

    it('should use default reason when none provided', async () => {
      mockChaosEngine.abortExperiment.mockResolvedValue(undefined);

      await controller.abortExperiment(experimentId, '');

      expect(mockChaosEngine.abortExperiment).toHaveBeenCalledWith(experimentId, 'Manual abort');
    });
  });

  describe('getResilienceReport', () => {
    const experimentId = 'test-experiment-123';
    const mockReport = {
      experimentId,
      overallScore: 85,
      categoryScores: {
        availability: 90,
        performance: 80,
        errorHandling: 85,
        recovery: 85,
      },
      weaknesses: ['High latency under load'],
      strengths: ['Quick recovery'],
      recommendations: [],
    };

    it('should generate resilience report', async () => {
      const mockExperiment: ExperimentResult = {
        experimentId,
        status: ExperimentStatus.COMPLETED,
        startTime: new Date(),
        endTime: new Date(),
        metrics: {} as any,
        incidents: [],
        resilienceScore: 85,
        recommendations: [],
      };

      mockChaosEngine.getExperimentStatus.mockResolvedValue(mockExperiment);
      mockChaosReporting.generateResilienceReport.mockResolvedValue(mockReport);

      const result = await controller.getResilienceReport(experimentId);

      expect(result).toEqual({ report: mockReport });
      expect(mockChaosEngine.getExperimentStatus).toHaveBeenCalledWith(experimentId);
      expect(mockChaosReporting.generateResilienceReport).toHaveBeenCalledWith(mockExperiment);
    });

    it('should throw error for non-existent experiment', async () => {
      mockChaosEngine.getExperimentStatus.mockResolvedValue(null);

      await expect(controller.getResilienceReport('non-existent')).rejects.toThrow(
        'Experiment not found'
      );
    });
  });

  describe('getSummaryReport', () => {
    it('should generate summary report', async () => {
      const mockExperiments: ExperimentResult[] = [
        {
          experimentId: 'exp-1',
          status: ExperimentStatus.COMPLETED,
          startTime: new Date(),
          endTime: new Date(),
          metrics: {} as any,
          incidents: [],
          resilienceScore: 85,
          recommendations: [],
        },
      ];

      const mockSummary = {
        totalExperiments: 1,
        averageResilienceScore: 85,
        experimentsByType: {},
        commonWeaknesses: [],
        trends: {},
        recommendations: [],
      };

      mockChaosEngine.getExperimentHistory.mockResolvedValue(mockExperiments);
      mockChaosReporting.generateSummaryReport.mockResolvedValue(mockSummary);

      const result = await controller.getSummaryReport();

      expect(result).toEqual({ summary: mockSummary });
      expect(mockChaosEngine.getExperimentHistory).toHaveBeenCalledWith(100);
      expect(mockChaosReporting.generateSummaryReport).toHaveBeenCalledWith(mockExperiments);
    });
  });

  describe('exportExperiment', () => {
    const experimentId = 'test-experiment-123';

    it('should export experiment in JSON format', async () => {
      const mockExportData = {
        format: 'json',
        experimentId,
        exportedAt: new Date(),
        data: {},
      };

      mockChaosReporting.exportExperimentResults.mockResolvedValue(mockExportData);

      const result = await controller.exportExperiment(experimentId, 'json');

      expect(result).toEqual(mockExportData);
      expect(mockChaosReporting.exportExperimentResults).toHaveBeenCalledWith(experimentId, 'json');
    });

    it('should export experiment in CSV format', async () => {
      const mockExportData = {
        format: 'csv',
        experimentId,
        exportedAt: new Date(),
        data: 'csv,data',
      };

      mockChaosReporting.exportExperimentResults.mockResolvedValue(mockExportData);

      const result = await controller.exportExperiment(experimentId, 'csv');

      expect(result).toEqual(mockExportData);
      expect(mockChaosReporting.exportExperimentResults).toHaveBeenCalledWith(experimentId, 'csv');
    });

    it('should export experiment in PDF format', async () => {
      const mockExportData = {
        format: 'pdf',
        experimentId,
        exportedAt: new Date(),
        data: 'pdf,data',
      };

      mockChaosReporting.exportExperimentResults.mockResolvedValue(mockExportData);

      const result = await controller.exportExperiment(experimentId, 'pdf');

      expect(result).toEqual(mockExportData);
      expect(mockChaosReporting.exportExperimentResults).toHaveBeenCalledWith(experimentId, 'pdf');
    });
  });

  describe('scheduleExperiment', () => {
    const validConfig: ChaosExperimentConfig = {
      id: 'scheduled-experiment',
      name: 'Scheduled Experiment',
      description: 'Test scheduled experiment',
      type: ChaosExperimentType.CHAOS_MONKEY,
      target: {
        services: ['test-service'],
      },
      schedule: {
        enabled: true,
        cron: '0 2 * * *',
        duration: 60,
      },
      blastRadius: {
        maxAffectedServices: 1,
        maxAffectedUsers: 100,
        excludeCriticalServices: true,
        customExclusions: [],
      },
      safeAbort: {
        enabled: false,
        triggers: [],
        rollbackStrategy: 'immediate' as any,
      },
      metrics: {
        collectBefore: true,
        collectDuring: true,
        collectAfter: true,
        metrics: ['error_rate'],
      },
    };

    it('should schedule an experiment', async () => {
      mockChaosScheduler.scheduleExperiment.mockResolvedValue(undefined);

      const result = await controller.scheduleExperiment(validConfig);

      expect(result).toEqual({ message: 'Experiment scheduled successfully' });
      expect(mockChaosScheduler.scheduleExperiment).toHaveBeenCalledWith(validConfig);
    });
  });

  describe('unscheduleExperiment', () => {
    const experimentId = 'test-experiment-123';

    it('should unschedule an experiment', async () => {
      mockChaosScheduler.unscheduleExperiment.mockResolvedValue(undefined);

      const result = await controller.unscheduleExperiment(experimentId);

      expect(result).toEqual({ message: 'Experiment unscheduled successfully' });
      expect(mockChaosScheduler.unscheduleExperiment).toHaveBeenCalledWith(experimentId);
    });
  });

  describe('getScheduledExperiments', () => {
    it('should return scheduled experiments', async () => {
      const mockScheduled = [
        {
          experimentId: 'exp-1',
          jobName: 'chaos-experiment-exp-1',
          nextRun: '2023-01-02T02:00:00.000Z',
          isRunning: false,
          lastRun: '2023-01-01T02:00:00.000Z',
        },
      ];

      mockChaosScheduler.getScheduledExperiments.mockResolvedValue(mockScheduled);

      const result = await controller.getScheduledExperiments();

      expect(result).toEqual({ scheduled: mockScheduled });
      expect(mockChaosScheduler.getScheduledExperiments).toHaveBeenCalled();
    });
  });

  describe('createRunbook', () => {
    const validConfig: ChaosExperimentConfig = {
      id: 'runbook-experiment',
      name: 'Runbook Experiment',
      description: 'Test runbook experiment',
      type: ChaosExperimentType.LATENCY_INJECTION,
      target: {
        dependencies: ['test-dependency'],
      },
      blastRadius: {
        maxAffectedServices: 2,
        maxAffectedUsers: 500,
        excludeCriticalServices: false,
        customExclusions: [],
      },
      safeAbort: {
        enabled: true,
        triggers: [],
        rollbackStrategy: 'graceful' as any,
      },
      metrics: {
        collectBefore: true,
        collectDuring: true,
        collectAfter: true,
        metrics: ['latency'],
      },
    };

    it('should create a runbook', async () => {
      const runbookId = 'runbook-123';
      mockChaosScheduler.scheduleRunbook.mockResolvedValue(runbookId);

      const result = await controller.createRunbook(validConfig);

      expect(result).toEqual({ runbookId });
      expect(mockChaosScheduler.scheduleRunbook).toHaveBeenCalledWith(validConfig);
    });
  });

  describe('executeRunbook', () => {
    const runbookId = 'runbook-123';
    const experimentId = 'exp-456';

    it('should execute a runbook', async () => {
      mockChaosScheduler.executeRunbook.mockResolvedValue(experimentId);

      const result = await controller.executeRunbook(runbookId);

      expect(result).toEqual({ experimentId });
      expect(mockChaosScheduler.executeRunbook).toHaveBeenCalledWith(runbookId);
    });
  });

  describe('pauseScheduler', () => {
    it('should pause the scheduler', async () => {
      mockChaosScheduler.pauseScheduler.mockResolvedValue(undefined);

      const result = await controller.pauseScheduler();

      expect(result).toEqual({ message: 'Scheduler paused successfully' });
      expect(mockChaosScheduler.pauseScheduler).toHaveBeenCalled();
    });
  });

  describe('resumeScheduler', () => {
    it('should resume the scheduler', async () => {
      mockChaosScheduler.resumeScheduler.mockResolvedValue(undefined);

      const result = await controller.resumeScheduler();

      expect(result).toEqual({ message: 'Scheduler resumed successfully' });
      expect(mockChaosScheduler.resumeScheduler).toHaveBeenCalled();
    });
  });

  describe('getExperimentTemplates', () => {
    it('should return predefined templates', async () => {
      const result = await controller.getExperimentTemplates();

      expect(result).toBeDefined();
      expect(result.templates).toBeDefined();
      expect(Array.isArray(result.templates)).toBe(true);
      expect(result.templates.length).toBeGreaterThan(0);

      // Verify template structure
      result.templates.forEach(template => {
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('type');
        expect(template).toHaveProperty('target');
        expect(template).toHaveProperty('blastRadius');
        expect(template).toHaveProperty('safeAbort');
        expect(template).toHaveProperty('metrics');
      });
    });
  });

  describe('getSystemHealth', () => {
    it('should return system health information', async () => {
      mockChaosEngine.getActiveExperiments.mockResolvedValue(['exp-1']);
      mockChaosScheduler.getScheduledExperiments.mockResolvedValue([
        { experimentId: 'exp-2', jobName: 'test', nextRun: null, isRunning: false, lastRun: null }
      ]);

      const result = await controller.getSystemHealth();

      expect(result).toBeDefined();
      expect(result.health).toBeDefined();
      expect(result.health).toHaveProperty('status');
      expect(result.health).toHaveProperty('activeExperiments');
      expect(result.health).toHaveProperty('scheduledExperiments');
      expect(result.health).toHaveProperty('systemMetrics');
      expect(result.health).toHaveProperty('lastExperiment');
      expect(result.health).toHaveProperty('recommendations');

      expect(result.health.activeExperiments).toBe(1);
      expect(result.health.scheduledExperiments).toBe(1);
    });
  });
});
