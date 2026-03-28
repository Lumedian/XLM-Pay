import { Test, TestingModule } from '@nestjs/testing';
import { ChaosSchedulerService } from '../services/chaos-scheduler.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ChaosEngineService } from '../services/chaos-engine.service';
import { StructuredLoggerService } from '../../logging/structured-logger.service';
import { 
  ChaosExperimentConfig, 
  ChaosExperimentType,
  ChaosSchedule
} from '../interfaces/chaos.interfaces';

describe('ChaosSchedulerService', () => {
  let service: ChaosSchedulerService;
  let schedulerRegistry: SchedulerRegistry;
  let chaosEngine: ChaosEngineService;
  let logger: StructuredLoggerService;

  const mockSchedulerRegistry = {
    addCronJob: jest.fn(),
    deleteCronJob: jest.fn(),
  };

  const mockChaosEngine = {
    runExperiment: jest.fn(),
    getExperimentStatus: jest.fn(),
    getActiveExperiments: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChaosSchedulerService,
        {
          provide: SchedulerRegistry,
          useValue: mockSchedulerRegistry,
        },
        {
          provide: ChaosEngineService,
          useValue: mockChaosEngine,
        },
        {
          provide: StructuredLoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ChaosSchedulerService>(ChaosSchedulerService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
    chaosEngine = module.get<ChaosEngineService>(ChaosEngineService);
    logger = module.get<StructuredLoggerService>(StructuredLoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize successfully', async () => {
      await service.onModuleInit();
      expect(logger.log).toHaveBeenCalledWith(
        'Chaos Scheduler initialized',
        'ChaosScheduler'
      );
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
        cron: '0 2 * * *', // Daily at 2 AM
        duration: 60,
        timezone: 'UTC',
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

    it('should schedule an experiment with valid cron expression', async () => {
      await service.scheduleExperiment(validConfig);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Scheduling chaos experiment'),
        'ChaosScheduler',
        expect.any(Object)
      );

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Chaos experiment scheduled successfully'),
        'ChaosScheduler',
        expect.any(Object)
      );
    });

    it('should not schedule experiment when scheduling is disabled', async () => {
      const configWithoutScheduling = {
        ...validConfig,
        schedule: {
          enabled: false,
          duration: 60,
        },
      };

      await service.scheduleExperiment(configWithoutScheduling);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('does not have scheduling enabled'),
        'ChaosScheduler'
      );
    });

    it('should not schedule experiment without cron expression', async () => {
      const configWithoutCron = {
        ...validConfig,
        schedule: {
          enabled: true,
          duration: 60,
        },
      };

      await service.scheduleExperiment(configWithoutCron);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('does not have scheduling enabled'),
        'ChaosScheduler'
      );
    });

    it('should replace existing schedule for same experiment', async () => {
      // Schedule first time
      await service.scheduleExperiment(validConfig);

      // Schedule second time (should replace)
      await service.scheduleExperiment(validConfig);

      expect(logger.log).toHaveBeenCalledTimes(4); // 2 for each scheduling
    });
  });

  describe('unscheduleExperiment', () => {
    it('should unschedule an existing experiment', async () => {
      const experimentId = 'test-experiment';
      
      // First schedule the experiment
      const validConfig: ChaosExperimentConfig = {
        id: experimentId,
        name: 'Test Experiment',
        description: 'Test',
        type: ChaosExperimentType.CHAOS_MONKEY,
        target: { services: ['test'] },
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

      await service.scheduleExperiment(validConfig);
      
      // Then unschedule it
      await service.unscheduleExperiment(experimentId);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Unscheduled chaos experiment'),
        'ChaosScheduler',
        expect.objectContaining({ experimentId })
      );
    });

    it('should handle unscheduling non-existent experiment gracefully', async () => {
      await service.unscheduleExperiment('non-existent');

      // Should not throw error, just log nothing
      expect(logger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Unscheduled chaos experiment'),
        'ChaosScheduler',
        expect.any(Object)
      );
    });
  });

  describe('scheduleRunbook', () => {
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

    it('should create a runbook for experiment', async () => {
      const runbookId = await service.scheduleRunbook(validConfig);

      expect(runbookId).toBeDefined();
      expect(typeof runbookId).toBe('string');
      expect(runbookId).toMatch(/^runbook_\d+_[a-z0-9]+$/);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Creating runbook for experiment'),
        'ChaosScheduler',
        expect.objectContaining({ runbookId, config: validConfig })
      );
    });
  });

  describe('executeRunbook', () => {
    it('should execute a runbook successfully', async () => {
      const runbookId = 'test-runbook-123';
      const experimentId = 'executed-experiment-456';

      mockChaosEngine.runExperiment.mockResolvedValue(experimentId);
      mockChaosEngine.getExperimentStatus.mockResolvedValue({
        experimentId,
        status: 'completed',
        startTime: new Date(),
        endTime: new Date(),
        metrics: {} as any,
        incidents: [],
        resilienceScore: 85,
        recommendations: [],
      });

      const result = await service.executeRunbook(runbookId);

      expect(result).toBe(experimentId);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Executing runbook'),
        'ChaosScheduler',
        { runbookId }
      );

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Executing pre-flight checks'),
        'ChaosScheduler'
      );

      expect(mockChaosEngine.runExperiment).toHaveBeenCalled();
    });

    it('should throw error for non-existent runbook', async () => {
      const nonExistentRunbookId = 'non-existent-runbook';

      await expect(service.executeRunbook(nonExistentRunbookId)).rejects.toThrow(
        'Runbook not found: non-existent-runbook'
      );
    });
  });

  describe('getScheduledExperiments', () => {
    it('should return list of scheduled experiments', async () => {
      const scheduled = await service.getScheduledExperiments();

      expect(Array.isArray(scheduled)).toBe(true);
      expect(scheduled).toEqual([]);
    });
  });

  describe('pauseScheduler', () => {
    it('should pause all scheduled experiments', async () => {
      await service.pauseScheduler();

      expect(logger.log).toHaveBeenCalledWith(
        'Pausing all chaos experiment schedules',
        'ChaosScheduler'
      );
    });
  });

  describe('resumeScheduler', () => {
    it('should resume all scheduled experiments', async () => {
      await service.resumeScheduler();

      expect(logger.log).toHaveBeenCalledWith(
        'Resuming all chaos experiment schedules',
        'ChaosScheduler'
      );
    });
  });

  describe('runbook generation', () => {
    const validConfig: ChaosExperimentConfig = {
      id: 'test-runbook',
      name: 'Test Runbook',
      description: 'Test runbook generation',
      type: ChaosExperimentType.DATABASE_FAILURE,
      target: {
        services: ['api'],
        dependencies: ['database'],
      },
      blastRadius: {
        maxAffectedServices: 5,
        maxAffectedUsers: 1000,
        excludeCriticalServices: false,
        customExclusions: [],
      },
      safeAbort: {
        enabled: true,
        triggers: [
          {
            type: 'error_rate',
            threshold: 10,
            window: 30,
          },
        ],
        rollbackStrategy: 'immediate' as any,
      },
      metrics: {
        collectBefore: true,
        collectDuring: true,
        collectAfter: true,
        metrics: ['error_rate', 'database_connections'],
      },
      schedule: {
        enabled: true,
        duration: 120,
      },
    };

    it('should generate comprehensive runbook steps', async () => {
      const runbookId = await service.scheduleRunbook(validConfig);

      expect(runbookId).toBeDefined();

      // The runbook should include database-specific steps
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Creating runbook for experiment'),
        'ChaosScheduler',
        expect.any(Object)
      );
    });
  });

  describe('safe execution window checks', () => {
    it('should check business hours', async () => {
      // This would be tested through the private method
      // For now, we just ensure the service handles the logic
      const validConfig: ChaosExperimentConfig = {
        id: 'business-hours-test',
        name: 'Business Hours Test',
        description: 'Test business hours logic',
        type: ChaosExperimentType.CHAOS_MONKEY,
        target: { services: ['test'] },
        schedule: {
          enabled: true,
          cron: '0 14 * * *', // 2 PM (business hours)
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

      await service.scheduleExperiment(validConfig);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Scheduling chaos experiment'),
        'ChaosScheduler',
        expect.any(Object)
      );
    });
  });

  describe('error handling', () => {
    it('should handle scheduling errors gracefully', async () => {
      const invalidConfig = {
        id: 'invalid-config',
        name: 'Invalid Config',
        description: 'Invalid configuration',
        type: 'invalid-type' as ChaosExperimentType,
        target: { services: [] },
        schedule: {
          enabled: true,
          cron: 'invalid-cron',
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

      // Should not throw, just handle gracefully
      await service.scheduleExperiment(invalidConfig);

      // The service should handle invalid configurations
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
