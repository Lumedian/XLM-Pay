import { IsEnum, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export enum AnalyticsQueryType {
  COHORT_ANALYSIS = 'cohort_analysis',
  FUNNEL_ANALYSIS = 'funnel_analysis',
  RETENTION_ANALYSIS = 'retention_analysis',
  AGGREGATE_COUNT = 'aggregate_count',
  AGGREGATE_SUM = 'aggregate_sum',
  AGGREGATE_AVERAGE = 'aggregate_average',
}

export enum TimeGranularity {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export class AnalyticsQueryDto {
  @IsEnum(AnalyticsQueryType)
  queryType: AnalyticsQueryType;

  @IsString()
  @IsOptional()
  dataSource?: string;

  @IsString()
  @IsOptional()
  timeField?: string;

  @IsEnum(TimeGranularity)
  @IsOptional()
  granularity?: TimeGranularity;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @Min(0.1)
  @Max(1.0)
  epsilon: number;

  @IsString()
  @IsOptional()
  groupBy?: string;

  @IsString()
  @IsOptional()
  filterField?: string;

  @IsString()
  @IsOptional()
  filterValue?: string;

  @IsNumber()
  @IsOptional()
  minCount?: number;

  @IsNumber()
  @IsOptional()
  maxCount?: number;
}
