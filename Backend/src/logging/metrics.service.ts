import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();

  // errors by severity and category
  public errorCounter: Counter<string>;

  onModuleInit() {
    // collect default Node process metrics
    collectDefaultMetrics({ register: this.registry });

    this.errorCounter = new Counter({
      name: 'application_errors_total',
      help: 'Total number of errors logged by severity and category',
      labelNames: ['severity', 'category'],
      registers: [this.registry],
    });
  }

  incrementError(severity: string, category = 'general') {
    this.errorCounter.inc({ severity, category });
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
