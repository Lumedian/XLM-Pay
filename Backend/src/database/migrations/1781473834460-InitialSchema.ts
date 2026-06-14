import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema migration.
 *
 * Hand-written to match the current entity definitions exactly. It replaces
 * the previous `synchronize`-based schema management so that the database
 * structure is reproducible and reviewable across every environment.
 *
 * Covers: workflows, workflow_steps, users, wallet_bindings, login_nonces,
 * refresh_tokens, api_tokens, audit_logs, voice_jobs — including the Postgres
 * enum types, jsonb columns, unique constraints, indexes and foreign keys
 * (with ON DELETE CASCADE) declared by the entities.
 */
export class InitialSchema1781473834460 implements MigrationInterface {
  name = 'InitialSchema1781473834460';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Required for uuid_generate_v4() used by uuid primary keys.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // -- Enum types -------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "workflows_type_enum" AS ENUM (
        'contract_deployment', 'trade_execution', 'ai_job_chain',
        'indexing_verification', 'portfolio_update', 'reward_grant'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "workflows_state_enum" AS ENUM (
        'pending', 'running', 'completed', 'failed',
        'cancelled', 'compensating', 'compensated'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "workflow_steps_state_enum" AS ENUM (
        'pending', 'running', 'completed', 'failed',
        'skipped', 'compensating', 'compensated'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "voice_jobs_type_enum" AS ENUM ('stt', 'tts')
    `);
    await queryRunner.query(`
      CREATE TYPE "voice_jobs_status_enum" AS ENUM (
        'pending', 'processing', 'completed', 'failed'
      )
    `);

    // -- workflows --------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "workflows" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "idempotencyKey" character varying NOT NULL,
        "type" "workflows_type_enum" NOT NULL,
        "state" "workflows_state_enum" NOT NULL DEFAULT 'pending',
        "userId" character varying,
        "walletAddress" character varying,
        "input" jsonb NOT NULL,
        "output" jsonb,
        "context" jsonb,
        "currentStepIndex" integer NOT NULL DEFAULT 0,
        "totalSteps" integer NOT NULL DEFAULT 0,
        "startedAt" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "failedAt" TIMESTAMP,
        "failureReason" character varying,
        "retryCount" integer NOT NULL DEFAULT 0,
        "maxRetries" integer NOT NULL DEFAULT 3,
        "nextRetryAt" TIMESTAMP,
        "requiresCompensation" boolean NOT NULL DEFAULT false,
        "isCompensated" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_workflows_idempotencyKey" UNIQUE ("idempotencyKey"),
        CONSTRAINT "PK_workflows" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_workflows_idempotencyKey" ON "workflows" ("idempotencyKey")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflows_state" ON "workflows" ("state")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflows_type" ON "workflows" ("type")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflows_userId" ON "workflows" ("userId")`);

    // -- workflow_steps ---------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "workflow_steps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workflowId" uuid NOT NULL,
        "stepName" character varying NOT NULL,
        "stepIndex" integer NOT NULL,
        "state" "workflow_steps_state_enum" NOT NULL DEFAULT 'pending',
        "input" jsonb,
        "output" jsonb,
        "config" jsonb,
        "retryCount" integer NOT NULL DEFAULT 0,
        "maxRetries" integer NOT NULL DEFAULT 3,
        "startedAt" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "failedAt" TIMESTAMP,
        "failureReason" character varying,
        "nextRetryAt" TIMESTAMP,
        "requiresCompensation" boolean NOT NULL DEFAULT false,
        "isCompensated" boolean NOT NULL DEFAULT false,
        "compensatedAt" TIMESTAMP,
        "compensationStepName" character varying,
        "compensationConfig" jsonb,
        "isIdempotent" boolean NOT NULL DEFAULT false,
        "idempotencyKey" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_steps" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_steps_workflowId" ON "workflow_steps" ("workflowId")`);
    await queryRunner.query(`CREATE INDEX "IDX_workflow_steps_state" ON "workflow_steps" ("state")`);

    // -- users ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying,
        "username" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // -- wallet_bindings --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "wallet_bindings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "publicKey" character varying NOT NULL,
        "userId" uuid NOT NULL,
        "boundAt" TIMESTAMP NOT NULL DEFAULT now(),
        "isPrimary" boolean NOT NULL DEFAULT true,
        "lastUsed" TIMESTAMP,
        CONSTRAINT "UQ_wallet_bindings_publicKey" UNIQUE ("publicKey"),
        CONSTRAINT "PK_wallet_bindings" PRIMARY KEY ("id")
      )
    `);

    // -- login_nonces -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "login_nonces" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nonce" character varying NOT NULL,
        "publicKey" character varying NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "used" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_login_nonces_nonce" UNIQUE ("nonce"),
        CONSTRAINT "PK_login_nonces" PRIMARY KEY ("id")
      )
    `);

    // -- refresh_tokens ---------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token" character varying NOT NULL,
        "userId" uuid NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "revoked" boolean NOT NULL DEFAULT false,
        "revokedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_refresh_tokens_token" UNIQUE ("token"),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id")
      )
    `);

    // -- api_tokens -------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "api_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token" character varying NOT NULL,
        "name" character varying NOT NULL,
        "role" character varying NOT NULL,
        "userId" uuid NOT NULL,
        "expiresAt" TIMESTAMP,
        "revoked" boolean NOT NULL DEFAULT false,
        "lastUsedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_api_tokens_token" UNIQUE ("token"),
        CONSTRAINT "PK_api_tokens" PRIMARY KEY ("id")
      )
    `);

    // -- audit_logs -------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "action_type" character varying NOT NULL,
        "actor_id" character varying NOT NULL,
        "entity_id" character varying,
        "metadata" jsonb,
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    // -- voice_jobs -------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "voice_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "voice_jobs_type_enum" NOT NULL,
        "status" "voice_jobs_status_enum" NOT NULL DEFAULT 'pending',
        "userId" character varying,
        "audioUrl" character varying,
        "audioHash" character varying,
        "transcribedText" text,
        "generatedAudioUrl" character varying,
        "inputText" text,
        "errorMessage" text,
        "retryCount" integer NOT NULL DEFAULT 0,
        "maxRetries" integer NOT NULL DEFAULT 3,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP,
        CONSTRAINT "PK_voice_jobs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_voice_jobs_status_createdAt" ON "voice_jobs" ("status", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_voice_jobs_userId_createdAt" ON "voice_jobs" ("userId", "createdAt")`);

    // -- foreign keys -----------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "workflow_steps"
      ADD CONSTRAINT "FK_workflow_steps_workflowId"
      FOREIGN KEY ("workflowId") REFERENCES "workflows"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_bindings"
      ADD CONSTRAINT "FK_wallet_bindings_userId"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD CONSTRAINT "FK_refresh_tokens_userId"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "api_tokens"
      ADD CONSTRAINT "FK_api_tokens_userId"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order.
    await queryRunner.query(`ALTER TABLE "api_tokens" DROP CONSTRAINT "FK_api_tokens_userId"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_refresh_tokens_userId"`);
    await queryRunner.query(`ALTER TABLE "wallet_bindings" DROP CONSTRAINT "FK_wallet_bindings_userId"`);
    await queryRunner.query(`ALTER TABLE "workflow_steps" DROP CONSTRAINT "FK_workflow_steps_workflowId"`);

    await queryRunner.query(`DROP INDEX "IDX_voice_jobs_userId_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_voice_jobs_status_createdAt"`);
    await queryRunner.query(`DROP TABLE "voice_jobs"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "api_tokens"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "login_nonces"`);
    await queryRunner.query(`DROP TABLE "wallet_bindings"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP INDEX "IDX_workflow_steps_state"`);
    await queryRunner.query(`DROP INDEX "IDX_workflow_steps_workflowId"`);
    await queryRunner.query(`DROP TABLE "workflow_steps"`);

    await queryRunner.query(`DROP INDEX "IDX_workflows_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_workflows_type"`);
    await queryRunner.query(`DROP INDEX "IDX_workflows_state"`);
    await queryRunner.query(`DROP INDEX "IDX_workflows_idempotencyKey"`);
    await queryRunner.query(`DROP TABLE "workflows"`);

    await queryRunner.query(`DROP TYPE "voice_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "voice_jobs_type_enum"`);
    await queryRunner.query(`DROP TYPE "workflow_steps_state_enum"`);
    await queryRunner.query(`DROP TYPE "workflows_state_enum"`);
    await queryRunner.query(`DROP TYPE "workflows_type_enum"`);
  }
}
