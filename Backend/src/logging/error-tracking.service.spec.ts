import { Test, TestingModule } from '@nestjs/testing';
import { ErrorTrackingService, ErrorSeverity } from './error-tracking.service';
import { MetricsService } from './metrics.service';
import { StructuredLogger } from './structured-logger.service';

describe('ErrorTrackingService', () => {
  let service: ErrorTrackingService;
  let metrics: MetricsService;
  let logger: StructuredLogger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ErrorTrackingService, MetricsService, StructuredLogger],
    }).compile();

    service = module.get<ErrorTrackingService>(ErrorTrackingService);
    metrics = module.get<MetricsService>(MetricsService);
    logger = module.get<StructuredLogger>(StructuredLogger);

    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(metrics, 'incrementError').mockImplementation(() => {} as any);
  });

  it('should track an error and increment metrics', async () => {
    await service.track({ message: 'test error', severity: ErrorSeverity.LOW });
    expect(metrics.incrementError).toHaveBeenCalledWith(ErrorSeverity.LOW, 'general');
    expect(logger.error).toHaveBeenCalled();
  });

  it('should trigger alert when error is critical', async () => {
    await service.track({ message: 'critical', severity: ErrorSeverity.CRITICAL });
    expect(logger.warn).toHaveBeenCalledWith('Critical error alert triggered', ErrorTrackingService.name);
  });
});
