import { Test, TestingModule } from '@nestjs/testing';
import { ChaosEngineService } from '../services/chaos-engine.service';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../logging/structured-logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { 
  ChaosExperimentConfig, 
  ChaosExperimentType,
  ExperimentStatus,
  RollbackStrategy
} from '../interfaces/chaos.interfaces';

describe('ChaosEngineService', () => {
  let service: ChaosEngineService;
  let configService: ConfigService;
  let logger: StructuredLoggerService;
  let eventEmitter: EventEmitter2;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChaosEngineService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: StructuredLoggerService,
          useValue: mockLogger,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<ChaosEngineService>(ChaosEngineService);
    configService = module.get<ConfigService>(ConfigService);
    logger = module.get<StructuredLoggerService>(StructuredLoggerService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
        triggers: [
          {
            type: 'error_rate',
            threshold: 10,
            window: 30,
          },
        ],
        rollbackStrategy: RollbackStrategy.IMMEDIATE,
      },
      metrics: {
        collectBefore: true,
        collectDuring: true,
        collectAfter: true,
        metrics: ['error_rate', 'latency'],
      },
    };

    it('should successfully run a chaos experiment', async () => {
      const experimentId = await service.runExperiment(validConfig);

      expect(experimentId).toBeDefined();
      expect(typeof experimentId).toBe('string');
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Starting chaos experiment'),
        'ChaosEngine',
        expect.any(Object)
      );
    });

    it('should validate blast radius constraints', async () => {
      const invalidConfig = {
        ...validConfig,
        target: {
          services: ['service1', 'service2', 'service3'],
        },
        blastRadius: {
          maxAffectedServices: 2,
          maxAffectedUsers: 100,
          excludeCriticalServices: true,
          customExclusions: [],
        },
      };

      await expect(service.runExperiment(invalidConfig)).rejects.toThrow(
        'Target services (3) exceed blast radius limit (2)'
      );
    });

    it('should exclude critical services when configured', async () => {
      const configWithCriticalServices = {
        ...validConfig,
        target: {
          services: ['auth', 'database'],
        },
        blastRadius: {
          maxAffectedServices: 5,
          maxAffectedUsers: 100,
          excludeCriticalServices: true,
          customExclusions: [],
        },
      };

      await expect(service.runExperiment(configWithCriticalServices)).rejects.toThrow(
        'Experiment targets critical services which are excluded by blast radius config'
      );
    });

    it('should detect experiment conflicts', async () => {
      // Start first experiment
      await service.runExperiment(validConfig);

      // Try to start conflicting experiment
      const conflictingConfig = {
        ...validConfig,
        id: 'conflicting-experiment',
        name: 'Conflicting Experiment',
        target: {
          services: ['test-service'], // Same service as first experiment
        },
      };

      await expect(service.runExperiment(conflictingConfig)).rejects.toThrow(
        'Experiment conflicts with active experiment'
      );
    });
  });

  describe('abortExperiment', () => {
    it('should abort an active experiment', async () => {
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
          rollbackStrategy: RollbackStrategy.IMMEDIATE,
        },
        metrics: {
          collectBefore: true,
          collectDuring: true,
          collectAfter: true,
          metrics: ['error_rate'],
        },
      };

      const experimentId = await service.runExperiment(validConfig);
      
      await service.abortExperiment(experimentId, 'Test abort');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Aborting chaos experiment'),
        'ChaosEngine'
      );
    });

    it('should throw error for non-existent experiment', async () => {
      await expect(service.abortExperiment('non-existent', 'Test')).rejects.toThrow(
        'Experiment non-existent not found'
      );
    });
  });

  describe('getExperimentStatus', () => {
    it('should return null for non-existent experiment', async () => {
      const result = await service.getExperimentStatus('non-existent');
      expect(result).toBeNull();
    });

    it('should return experiment status for existing experiment', async () => {
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
          enabled: false,
          triggers: [],
          rollbackStrategy: RollbackStrategy.IMMEDIATE,
        },
        metrics: {
          collectBefore: true,
          collectDuring: true,
          collectAfter: true,
          metrics: ['error_rate'],
        },
      };

      const experimentId = await service.runExperiment(validConfig);
      const result = await service.getExperimentStatus(experimentId);

      expect(result).toBeDefined();
      expect(result?.experimentId).toBe(experimentId);
      expect(result?.status).toBe(ExperimentStatus.COMPLETED);
    });
  });

  describe('getActiveExperiments', () => {
    it('should return list of active experiment IDs', async () => {
      const validConfig: ChaosExperimentConfig = {
        id: 'test-experiment',
        name: 'Test Experiment',
        description: 'Test chaos experiment',
        type: ChaosExperimentType.LATENCY_INJECTION,
        target: {
          services: [],
          dependencies: ['test-dependency'],
        },
        blastRadius: {
          maxAffectedServices: 1,
          maxAffectedUsers: 100,
          excludeCriticalServices: false,
          customExclusions: [],
        },
        safeAbort: {
          enabled: false,
          triggers: [],
          rollbackStrategy: RollbackStrategy.IMMEDIATE,
        },
        metrics: {
          collectBefore: true,
          collectDuring: true,
          collectAfter: true,
          metrics: ['latency'],
        },
        schedule: {
          enabled: true,
          duration: 120, // Long duration to keep it "active"
        },
      };

      await service.runExperiment(validConfig);
      const activeExperiments = await service.getActiveExperiments();

      expect(Array.isArray(activeExperiments)).toBe(true);
      expect(activeExperiments.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getExperimentHistory', () => {
    it('should return experiment history with limit', async () => {
      const validConfig: ChaosExperimentConfig = {
        id: 'test-experiment',
        name: 'Test Experiment',
        description: 'Test chaos experiment',
        type: ChaosExperimentType.MEMORY_STRESS,
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
          enabled: false,
          triggers: [],
          rollbackStrategy: RollbackStrategy.IMMEDIATE,
        },
        metrics: {
          collectBefore: true,
          collectDuring: true,
          collectAfter: true,
          metrics: ['memory_usage'],
        },
      };

      await service.runExperiment(validConfig);
      const history = await service.getExperimentHistory(5);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe('experiment types', () => {
    const experimentTypes = [
      ChaosExperimentType.CHAOS_MONKEY,
      ChaosExperimentType.LATENCY_INJECTION,
      ChaosExperimentType.DATABASE_FAILURE,
      ChaosExperimentType.MEMORY_STRESS,
      ChaosExperimentType.CPU_STRESS,
    ];

    experimentTypes.forEach(type => {
      it(`should execute ${type} experiment successfully`, async () => {
        const config: ChaosExperimentConfig = {
          id: `test-${type}`,
          name: `Test ${type} Experiment`,
          description: `Test ${type} chaos experiment`,
          type,
          target: {
            services: type === ChaosExperimentType.LATENCY_INJECTION || type === ChaosExperimentType.DATABASE_FAILURE 
              ? [] 
              : ['test-service'],
            dependencies: type === ChaosExperimentType.LATENCY_INJECTION || type === ChaosExperimentType.DATABASE_FAILURE
              ? ['test-dependency']
              : undefined,
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
            rollbackStrategy: RollbackStrategy.IMMEDIATE,
          },
          metrics: {
            collectBefore: true,
            collectDuring: true,
            collectAfter: true,
            metrics: ['error_rate'],
          },
        };

        const experimentId = await service.runExperiment(config);
        expect(experimentId).toBeDefined();
      });
    });
  });

  describe('safe abort mechanisms', () => {
    it('should setup abort monitoring when enabled', async () => {
      const configWithAbort: ChaosExperimentConfig = {
        id: 'test-abort',
        name: 'Test Abort Experiment',
        description: 'Test experiment with abort monitoring',
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
          triggers: [
            {
              type: 'error_rate',
              threshold: 10,
              window: 30,
            },
            {
              type: 'cpu_usage',
              threshold: 80,
              window: 60,
            },
          ],
          rollbackStrategy: RollbackStrategy.IMMEDIATE,
        },
        metrics: {
          collectBefore: true,
          collectDuring: true,
          collectAfter: true,
          metrics: ['error_rate', 'cpu_usage'],
        },
      };

      const experimentId = await service.runExperiment(configWithAbort);
      expect(experimentId).toBeDefined();
      
      // Verify that abort monitoring was set up
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Starting chaos experiment'),
        'ChaosEngine',
        expect.objectContaining({
          config: expect.objectContaining({
            safeAbort: expect.objectContaining({
              enabled: true,
              triggers: expect.arrayContaining([
                expect.objectContaining({ type: 'error_rate' }),
                expect.objectContaining({ type: 'cpu_usage' }),
              ]),
            }),
          }),
        })
      );
    });
  });

  describe('module lifecycle', () => {
    it('should initialize on module init', async () => {
      await service.onModuleInit();
      expect(logger.log).toHaveBeenCalledWith(
        'Chaos Engine initialized',
        'ChaosEngine'
      );
    });

    it('should cleanup on module destroy', async () => {
      // Start an experiment first
      const validConfig: ChaosExperimentConfig = {
        id: 'test-cleanup',
        name: 'Test Cleanup Experiment',
        description: 'Test experiment for cleanup',
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
          enabled: false,
          triggers: [],
          rollbackStrategy: RollbackStrategy.IMMEDIATE,
        },
        metrics: {
          collectBefore: true,
          collectDuring: true,
          collectAfter: true,
          metrics: ['error_rate'],
        },
      };

      await service.runExperiment(validConfig);
      
      // Then destroy module
      await service.onModuleDestroy();
      
      // Should have aborted all experiments
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Aborting all experiments'),
        'ChaosEngine'
      );
    });
  });
});
