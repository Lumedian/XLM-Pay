import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppService } from './app.service';
import { DatabaseHealthIndicator } from './database/database-health.indicator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly databaseHealth: DatabaseHealthIndicator,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Readiness probe. Returns 200 only when the database answers `SELECT 1`,
   * otherwise 503 so orchestrators stop routing traffic to this instance.
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async readiness() {
    const result = await this.databaseHealth.isHealthy();
    if (result.database.status !== 'up') {
      throw new ServiceUnavailableException(result);
    }
    return { status: 'ok', details: result };
  }
}
