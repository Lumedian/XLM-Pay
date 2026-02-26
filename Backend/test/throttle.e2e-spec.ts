import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import request from 'supertest';
import { ThrottleModule } from '../src/throttle/throttle.module';
import { ThrottleGuard } from '../src/throttle/throttle.guard';
import { ThrottleStrategy } from '../src/throttle/throttle.decorator';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from '../src/redis/redis.service';
import { MetricsService } from '../src/observability/services/metrics.service';

@Controller('test')
@UseGuards(ThrottleGuard)
class TestController {
  @Get('global')
  @ThrottleStrategy('GLOBAL')
  getGlobal() {
    return 'ok';
  }

  @Post('auth')
  @ThrottleStrategy('AUTH')
  postAuth() {
    return 'ok';
  }
}

describe('Throttle (e2e)', () => {
  let app: INestApplication;
  const redisMap = new Map<string, number>();
  const ttlMap = new Map<string, number>();

  const mockRedisService = {
    client: {
      eval: jest.fn().mockImplementation((script, options) => {
        const keys = options?.keys || [];
        const args = options?.arguments || [];
        const key = keys[0];

        if (key.startsWith('rate:')) {
          const window = parseInt(args[0] || '60');
          const current = (redisMap.get(key) || 0) + 1;
          redisMap.set(key, current);
          if (current === 1) {
            ttlMap.set(key, window);
          }
          return [current, ttlMap.get(key) || window];
        } else if (key.startsWith('violations:')) {
          const current = (redisMap.get(key) || 0) + 1;
          redisMap.set(key, current);
          return current;
        }
        return [0, 0];
      }),
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK'),
    },
  };

  const mockMetricsService = {
    recordRateLimitHit: jest.fn(),
    recordRateLimitViolation: jest.fn(),
    recordRateLimitBan: jest.fn(),
  };

  beforeEach(async () => {
    redisMap.clear();
    ttlMap.clear();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ThrottleModule],
      controllers: [TestController],
    })
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(MetricsService)
      .useValue(mockMetricsService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should enforce global rate limit (100) and return headers', async () => {
    const res = await request(app.getHttpServer()).get('/test/global');

    expect(res.headers['x-ratelimit-limit']).toBe('100');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.status).toBe(200);
  });

  it('should enforce auth rate limit (5) and return 429 after 5 requests', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer()).post('/test/auth');
      expect(res.status).toBe(201);
      expect(res.headers['x-ratelimit-limit']).toBe('5');
    }

    const res = await request(app.getHttpServer()).post('/test/auth');
    expect(res.status).toBe(429);
    expect(res.body.message).toBe('Rate limit exceeded');
  });
});
