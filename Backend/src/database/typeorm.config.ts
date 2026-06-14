import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { Workflow } from '../workflow/entities/workflow.entity';
import { WorkflowStep } from '../workflow/entities/workflow-step.entity';
import { User } from '../auth/entities/user.entity';
import { WalletBinding } from '../auth/entities/wallet-binding.entity';
import { LoginNonce } from '../auth/entities/login-nonce.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { ApiToken } from '../auth/entities/api-token.entity';
import { AuditLog } from '../audit/audit.entity';
import { VoiceJob } from '../voice/entities/voice-job.entity';

/**
 * Builds the runtime TypeORM configuration.
 *
 * Extracted from AppModule so the pool, retry and schema-management settings
 * can be asserted in isolation by unit tests.
 */
export function createTypeOrmOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: configService.get('DB_HOST') || 'localhost',
    port: configService.get('DB_PORT') || 5432,
    username: configService.get('DB_USERNAME') || 'postgres',
    password: configService.get('DB_PASSWORD') || 'password',
    database: configService.get('DB_DATABASE') || 'stellara_workflows',
    entities: [
      Workflow,
      WorkflowStep,
      User,
      WalletBinding,
      LoginNonce,
      RefreshToken,
      ApiToken,
      AuditLog,
      VoiceJob,
    ],
    // Schema is managed exclusively through migrations in every environment.
    // `synchronize` is never enabled because it can silently drop and recreate
    // tables.
    synchronize: false,
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    // Migrations are applied explicitly via the `migration:run` script, never
    // automatically on boot.
    migrationsRun: false,
    logging: configService.get('NODE_ENV') === 'development',
    // Retry transient connection failures (e.g. PostgreSQL connection resets)
    // on startup. TypeORM uses a fixed delay between attempts.
    retryAttempts: 5,
    retryDelay: 3000,
    // Connection pool limits passed through to the underlying `pg` driver.
    extra: {
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
    },
  };
}
