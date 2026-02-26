import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThrottleService } from './throttle/throttle.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const mockThrottleService = {
      checkBan: jest.fn(),
      checkRateLimit: jest
        .fn()
        .mockResolvedValue({ current: 1, limit: 100, ttl: 60 }),
      registerViolation: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: ThrottleService, useValue: mockThrottleService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
