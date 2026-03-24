import { UsageMetric } from '@prisma/client';
import { IsEnum, IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class RecordTenantUsageDto {
  @IsEnum(UsageMetric)
  metric: UsageMetric;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
