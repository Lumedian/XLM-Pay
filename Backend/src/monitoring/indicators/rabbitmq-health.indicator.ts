import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { RabbitMqService } from '../../messaging/rabbitmq/rabbitmq.service';

@Injectable()
export class RabbitMqHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RabbitMqHealthIndicator.name);

  constructor(private readonly rabbitmqService: RabbitMqService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // amqplib connection doesn't have a direct ping, but we can check if the channel is present and valid
      const channel = this.rabbitmqService.getChannel();
      if (!channel) {
        throw new Error('RabbitMQ channel not initialized');
      }
      return this.getStatus(key, true);
    } catch (e) {
      this.logger.error(`RabbitMQ health check failed: ${(e as Error).message}`);
      const status = this.getStatus(key, false, { message: (e as Error).message });
      throw new HealthCheckError('RabbitMQ check failed', status);
    }
  }
}
