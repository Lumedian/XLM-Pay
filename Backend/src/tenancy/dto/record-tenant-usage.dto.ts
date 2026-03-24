import { IsIn, IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { USAGE_METRICS, UsageMetric } from '../tenancy.types';

export class RecordTenantUsageDto {
  @IsIn(USAGE_METRICS)
  metric: UsageMetric;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
