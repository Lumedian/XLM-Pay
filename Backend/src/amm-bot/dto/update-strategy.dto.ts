import { IsString, IsEnum, IsArray, IsNumber, IsOptional, Min, Max, PartialType } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StrategyType } from '../entities/bot-strategy.entity';
import { DexConfigurationDto, CreateStrategyDto } from './create-strategy.dto';

export class UpdateStrategyDto extends PartialType(CreateStrategyDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ enum: StrategyType, required: false })
  @IsOptional()
  @IsEnum(StrategyType)
  strategyType?: StrategyType;

  @ApiProperty({ required: false })
  @IsOptional()
  configuration?: {
    totalLiquidity?: string;
    rebalanceThreshold?: number;
    maxSlippage?: number;
    priceRange?: {
      lowerBound: string;
      upperBound: string;
    };
    feeTier?: number;
    rebalanceTriggers?: {
      priceDeviation: number;
      timeInterval: number;
      impermanentLossThreshold: number;
    };
  };

  @ApiProperty({ type: [DexConfigurationDto], required: false })
  @IsOptional()
  @IsArray()
  dexConfigurations?: DexConfigurationDto[];
}
