import { IsString, IsEnum, IsNumber, IsObject, IsOptional, IsArray, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { StrategyType, DexType } from '../interfaces/amm-bot.interface';

export class PriceRangeDto {
  @IsNumber()
  @Min(0)
  lower: number;

  @IsNumber()
  @Min(0)
  upper: number;
}

export class RiskParametersDto {
  @IsNumber()
  @Min(0)
  maxPositionSize: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  stopLossPercentage: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  takeProfitPercentage: number;

  @IsObject()
  @Type(() => PriceRangeDto)
  priceRange: PriceRangeDto;

  @IsNumber()
  @Min(0)
  @Max(100)
  rebalanceTrigger: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  maxSlippage: number;
}

export class StrategyConfigDto {
  @IsEnum(StrategyType)
  type: StrategyType;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsObject()
  @Type(() => RiskParametersDto)
  riskParameters: RiskParametersDto;

  @IsObject()
  specificParams: Record<string, any>;
}

export class CreateBotDto {
  @IsString()
  name: string;

  @IsObject()
  @Type(() => StrategyConfigDto)
  strategy: StrategyConfigDto;

  @IsArray()
  @IsEnum(DexType, { each: true })
  targetDexes: DexType[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  initialCapital?: number;

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean = true;
}
