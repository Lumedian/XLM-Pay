import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';

describe('ThrottleController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should enforce global rate limit and return headers', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.headers['x-ratelimit-limit']).toBe('100');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('should enforce auth rate limit and return 429 after 5 requests', async () => {
    const publicKey = 'G...',
      nonce = '...';

    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ publicKey });
      expect(res.status).not.toBe(429);
      expect(res.headers['x-ratelimit-limit']).toBe('5');
    }

    const res = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ publicKey });
    expect(res.status).toBe(429);
  });
});
