import { Test, TestingModule } from '@nestjs/testing';
import { ChaosReportingService } from '../services/chaos-reporting.service';
import { StructuredLoggerService } from '../../logging/structured-logger.service';
import { 
  ExperimentResult, 
  ExperimentStatus,
  ChaosIncident,
  IncidentSeverity,
  IncidentType
} from '../interfaces/chaos.interfaces';

describe('ChaosReportingService', () => {
  let service: ChaosReportingService;
  let logger: StructuredLoggerService;

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChaosReportingService,
        {
          provide: StructuredLoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ChaosReportingService>(ChaosReportingService);
    logger = module.get<StructuredLoggerService>(StructuredLoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateResilienceReport', () => {
    const mockExperimentResult: ExperimentResult = {
      experimentId: 'test-experiment-1',
      status: ExperimentStatus.COMPLETED,
      startTime: new Date('2023-01-01T10:00:00Z'),
      endTime: new Date('2023-01-01T10:02:00Z'),
      metrics: {
        before: {
          timestamp: new Date('2023-01-01T10:00:00Z'),
          errorRate: 1,
          avgLatency: 100,
          p95Latency: 200,
          p99Latency: 300,
          throughput: 1000,
          cpuUsage: 30,
          memoryUsage: 40,
          activeConnections: 50,
        },
        during: {
          timestamp: new Date('2023-01-01T10:01:00Z'),
          errorRate: 5,
          avgLatency: 150,
          p95Latency: 300,
          p99Latency: 450,
          throughput: 800,
          cpuUsage: 60,
          memoryUsage: 55,
          activeConnections: 45,
        },
        after: {
          timestamp: new Date('2023-01-01T10:02:00Z'),
          errorRate: 1.5,
          avgLatency: 110,
          p95Latency: 220,
          p99Latency: 330,
          throughput: 950,
          cpuUsage: 35,
          memoryUsage: 42,
          activeConnections: 48,
        },
      },
      incidents: [
        {
          id: 'incident-1',
          type: IncidentType.SERVICE_UNAVAILABLE,
          severity: IncidentSeverity.HIGH,
          timestamp: new Date('2023-01-01T10:00:30Z'),
          description: 'Service temporarily unavailable',
          affectedServices: ['api'],
          resolved: true,
        },
        {
          id: 'incident-2',
          type: IncidentType.HIGH_LATENCY,
          severity: IncidentSeverity.MEDIUM,
          timestamp: new Date('2023-01-01T10:01:00Z'),
          description: 'High latency detected',
          affectedServices: ['database'],
          resolved: true,
        },
      ],
      resilienceScore: 75,
      recommendations: ['Add retry logic', 'Implement caching'],
    };

    it('should generate a comprehensive resilience report', async () => {
      const report = await service.generateResilienceReport(mockExperimentResult);

      expect(report).toBeDefined();
      expect(report.experimentId).toBe(mockExperimentResult.experimentId);
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(report.categoryScores).toBeDefined();
      expect(report.categoryScores.availability).toBeDefined();
      expect(report.categoryScores.performance).toBeDefined();
      expect(report.categoryScores.errorHandling).toBeDefined();
      expect(report.categoryScores.recovery).toBeDefined();
      expect(Array.isArray(report.weaknesses)).toBe(true);
      expect(Array.isArray(report.strengths)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Generating resilience report'),
        'ChaosReporting',
        expect.any(Object)
      );
    });

    it('should calculate availability score correctly', async () => {
      const report = await service.generateResilienceReport(mockExperimentResult);
      
      // Should deduct points for service unavailable incidents
      expect(report.categoryScores.availability).toBeLessThan(100);
      expect(report.categoryScores.availability).toBeGreaterThanOrEqual(0);
    });

    it('should calculate performance score based on metrics', async () => {
      const report = await service.generateResilienceReport(mockExperimentResult);
      
      // Should consider latency and error rate changes
      expect(report.categoryScores.performance).toBeGreaterThanOrEqual(0);
      expect(report.categoryScores.performance).toBeLessThanOrEqual(100);
    });

    it('should identify weaknesses from incidents', async () => {
      const report = await service.generateResilienceReport(mockExperimentResult);
      
      expect(report.weaknesses.length).toBeGreaterThan(0);
      expect(report.weaknesses.some(w => w.includes('availability'))).toBe(true);
    });

    it('should identify strengths from successful recovery', async () => {
      const report = await service.generateResilienceReport(mockExperimentResult);
      
      expect(report.strengths.length).toBeGreaterThan(0);
      expect(report.strengths.some(s => s.includes('resolved'))).toBe(true);
    });

    it('should generate recommendations based on scores', async () => {
      const report = await service.generateResilienceReport(mockExperimentResult);
      
      expect(report.recommendations.length).toBeGreaterThan(0);
      report.recommendations.forEach(rec => {
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('category');
        expect(rec).toHaveProperty('description');
        expect(rec).toHaveProperty('implementation');
        expect(rec).toHaveProperty('estimatedImpact');
      });
    });
  });

  describe('generateSummaryReport', () => {
    const mockExperimentResults: ExperimentResult[] = [
      {
        experimentId: 'exp-1',
        status: ExperimentStatus.COMPLETED,
        startTime: new Date('2023-01-01T10:00:00Z'),
        endTime: new Date('2023-01-01T10:02:00Z'),
        metrics: {} as any,
        incidents: [],
        resilienceScore: 85,
        recommendations: ['Add caching'],
      },
      {
        experimentId: 'exp-2',
        status: ExperimentStatus.COMPLETED,
        startTime: new Date('2023-01-01T11:00:00Z'),
        endTime: new Date('2023-01-01T11:01:30Z'),
        metrics: {} as any,
        incidents: [],
        resilienceScore: 72,
        recommendations: ['Improve error handling'],
      },
      {
        experimentId: 'exp-3',
        status: ExperimentStatus.COMPLETED,
        startTime: new Date('2023-01-01T12:00:00Z'),
        endTime: new Date('2023-01-01T12:03:00Z'),
        metrics: {} as any,
        incidents: [],
        resilienceScore: 90,
        recommendations: ['Monitor performance'],
      },
    ];

    it('should generate summary report for multiple experiments', async () => {
      const summary = await service.generateSummaryReport(mockExperimentResults);

      expect(summary).toBeDefined();
      expect(summary.totalExperiments).toBe(3);
      expect(summary.averageResilienceScore).toBeCloseTo(82.33, 1);
      expect(summary.experimentsByType).toBeDefined();
      expect(summary.commonWeaknesses).toBeDefined();
      expect(summary.trends).toBeDefined();
      expect(summary.recommendations).toBeDefined();

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Generated summary report'),
        'ChaosReporting',
        expect.any(Object)
      );
    });

    it('should calculate average resilience score correctly', async () => {
      const summary = await service.generateSummaryReport(mockExperimentResults);
      
      const expectedAverage = (85 + 72 + 90) / 3;
      expect(summary.averageResilienceScore).toBeCloseTo(expectedAverage, 1);
    });

    it('should group experiments by type', async () => {
      const summary = await service.generateSummaryReport(mockExperimentResults);
      
      expect(summary.experimentsByType).toBeDefined();
      expect(typeof summary.experimentsByType).toBe('object');
    });

    it('should identify common weaknesses across experiments', async () => {
      const summary = await service.generateSummaryReport(mockExperimentResults);
      
      expect(Array.isArray(summary.commonWeaknesses)).toBe(true);
    });

    it('should analyze trends when sufficient data available', async () => {
      const summary = await service.generateSummaryReport(mockExperimentResults);
      
      expect(summary.trends).toBeDefined();
      if (typeof summary.trends === 'object' && !('message' in summary.trends)) {
        expect(summary.trends).toHaveProperty('trend');
        expect(summary.trends).toHaveProperty('recentAverage');
        expect(summary.trends).toHaveProperty('olderAverage');
        expect(summary.trends).toHaveProperty('change');
      }
    });

    it('should handle insufficient data for trend analysis', async () => {
      const singleResult = [mockExperimentResults[0]];
      const summary = await service.generateSummaryReport(singleResult);
      
      expect(summary.trends).toBeDefined();
      expect(summary.trends).toHaveProperty('message');
    });
  });

  describe('exportExperimentResults', () => {
    const experimentId = 'test-export-1';

    it('should export results in JSON format', async () => {
      const result = await service.exportExperimentResults(experimentId, 'json');

      expect(result).toBeDefined();
      expect(result.format).toBe('json');
      expect(result.experimentId).toBe(experimentId);
      expect(result.exportedAt).toBeInstanceOf(Date);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Exporting experiment results'),
        'ChaosReporting',
        expect.any(Object)
      );
    });

    it('should export results in CSV format', async () => {
      const result = await service.exportExperimentResults(experimentId, 'csv');

      expect(result).toBeDefined();
      expect(result.format).toBe('csv');
      expect(result.experimentId).toBe(experimentId);
      expect(result.exportedAt).toBeInstanceOf(Date);
    });

    it('should export results in PDF format', async () => {
      const result = await service.exportExperimentResults(experimentId, 'pdf');

      expect(result).toBeDefined();
      expect(result.format).toBe('pdf');
      expect(result.experimentId).toBe(experimentId);
      expect(result.exportedAt).toBeInstanceOf(Date);
    });

    it('should throw error for unsupported format', async () => {
      await expect(
        service.exportExperimentResults(experimentId, 'xml' as any)
      ).rejects.toThrow('Unsupported export format: xml');
    });
  });

  describe('edge cases', () => {
    it('should handle experiment with no incidents', async () => {
      const experimentWithNoIncidents: ExperimentResult = {
        experimentId: 'no-incidents',
        status: ExperimentStatus.COMPLETED,
        startTime: new Date(),
        endTime: new Date(),
        metrics: {
          before: {
            timestamp: new Date(),
            errorRate: 0,
            avgLatency: 50,
            p95Latency: 100,
            p99Latency: 150,
            throughput: 2000,
            cpuUsage: 20,
            memoryUsage: 30,
            activeConnections: 25,
          },
          during: {
            timestamp: new Date(),
            errorRate: 0,
            avgLatency: 55,
            p95Latency: 110,
            p99Latency: 165,
            throughput: 1900,
            cpuUsage: 25,
            memoryUsage: 32,
            activeConnections: 24,
          },
          after: {
            timestamp: new Date(),
            errorRate: 0,
            avgLatency: 52,
            p95Latency: 105,
            p99Latency: 158,
            throughput: 1950,
            cpuUsage: 22,
            memoryUsage: 31,
            activeConnections: 25,
          },
        },
        incidents: [],
        resilienceScore: 95,
        recommendations: [],
      };

      const report = await service.generateResilienceReport(experimentWithNoIncidents);
      
      expect(report.overallScore).toBeGreaterThan(80);
      expect(report.weaknesses.length).toBe(0);
      expect(report.strengths.length).toBeGreaterThan(0);
    });

    it('should handle experiment with critical incidents', async () => {
      const experimentWithCriticalIncidents: ExperimentResult = {
        experimentId: 'critical-incidents',
        status: ExperimentStatus.COMPLETED,
        startTime: new Date(),
        endTime: new Date(),
        metrics: {} as any,
        incidents: [
          {
            id: 'critical-1',
            type: IncidentType.SERVICE_UNAVAILABLE,
            severity: IncidentSeverity.CRITICAL,
            timestamp: new Date(),
            description: 'Critical service failure',
            affectedServices: ['auth', 'payment'],
            resolved: false,
          },
        ],
        resilienceScore: 25,
        recommendations: ['Implement redundancy', 'Add monitoring'],
      };

      const report = await service.generateResilienceReport(experimentWithCriticalIncidents);
      
      expect(report.overallScore).toBeLessThan(50);
      expect(report.weaknesses.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.priority === 'high')).toBe(true);
    });

    it('should handle empty experiment list for summary', async () => {
      const summary = await service.generateSummaryReport([]);
      
      expect(summary.totalExperiments).toBe(0);
      expect(summary.averageResilienceScore).toBe(0);
    });
  });
});
