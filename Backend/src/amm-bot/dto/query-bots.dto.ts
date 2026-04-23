import { IsOptional, IsEnum, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BotStatus, StrategyType, DexType } from '../interfaces/amm-bot.interface';

export class QueryBotsDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(BotStatus)
  status?: BotStatus;

  @IsOptional()
  @IsEnum(StrategyType)
  strategyType?: StrategyType;

  @IsOptional()
  @IsEnum(DexType)
  dexType?: DexType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class PerformanceQueryDto {
  @IsString()
  botId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  days?: number = 7;

  @IsOptional()
  @IsEnum(['hourly', 'daily'])
  granularity?: 'hourly' | 'daily' = 'daily';
}
