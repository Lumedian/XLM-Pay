import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface HealthIndicatorResult {
  [key: string]: {
    status: 'up' | 'down';
    message?: string;
  };
}

/**
 * Readiness check for the PostgreSQL connection.
 *
 * Runs a trivial `SELECT 1` against the pool. A successful round-trip proves
 * the database is reachable and the pool can hand out a connection, which is
 * exactly what a Kubernetes-style readiness probe needs to know.
 *
 * Custom (no @nestjs/terminus dependency) so the result shape stays small and
 * easy to assert in tests.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    try {
      await this.dataSource.query('SELECT 1');
      return { [key]: { status: 'up' } };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Database unreachable';
      return { [key]: { status: 'down', message } };
    }
  }
}
