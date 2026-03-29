import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import * as StellarSdk from '@stellar/stellar-sdk';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StellarHealthIndicator extends HealthIndicator {
  private readonly server: StellarSdk.Horizon.Server;
  private readonly logger = new Logger(StellarHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {
    super();
    const networkUrl = this.configService.get<string>('STELLAR_NETWORK_URL') || 'https://horizon-testnet.stellar.org';
    this.server = new StellarSdk.Horizon.Server(networkUrl);
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Fetch base fee to check connectivity
      await this.server.fetchBaseFee();
      return this.getStatus(key, true);
    } catch (e) {
      this.logger.error(`Stellar connectivity check failed: ${(e as Error).message}`);
      const status = this.getStatus(key, false, { message: (e as Error).message });
      throw new HealthCheckError('Stellar Horizon check failed', status);
    }
  }
}
