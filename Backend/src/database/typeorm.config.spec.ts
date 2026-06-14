import { ConfigService } from '@nestjs/config';
import { createTypeOrmOptions } from './typeorm.config';

describe('createTypeOrmOptions', () => {
  const buildConfigService = (env: Record<string, unknown> = {}) =>
    ({ get: (key: string) => env[key] }) as unknown as ConfigService;

  it('applies the connection pool configuration', () => {
    const options = createTypeOrmOptions(buildConfigService()) as any;

    expect(options.extra).toEqual({
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
    });
  });

  it('configures startup retry behaviour', () => {
    const options = createTypeOrmOptions(buildConfigService()) as any;

    expect(options.retryAttempts).toBe(5);
    expect(options.retryDelay).toBe(3000);
  });

  it('never enables synchronize and does not auto-run migrations on boot', () => {
    const dev = createTypeOrmOptions(
      buildConfigService({ NODE_ENV: 'development' }),
    ) as any;
    const prod = createTypeOrmOptions(
      buildConfigService({ NODE_ENV: 'production' }),
    ) as any;

    expect(dev.synchronize).toBe(false);
    expect(prod.synchronize).toBe(false);
    expect(dev.migrationsRun).toBe(false);
  });

  it('reads the canonical DB env vars', () => {
    const options = createTypeOrmOptions(
      buildConfigService({
        DB_USERNAME: 'app_user',
        DB_DATABASE: 'app_db',
      }),
    ) as any;

    expect(options.username).toBe('app_user');
    expect(options.database).toBe('app_db');
  });
});
