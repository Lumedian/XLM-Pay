import { IsString, IsEnum, IsArray, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StrategyType } from '../entities/bot-strategy.entity';

export class DexConfigurationDto {
  @ApiProperty()
  @IsString()
  dexName: string;

  @ApiProperty()
  @IsString()
  poolAddress: string;

  @ApiProperty()
  tokenPair: {
    tokenA: string;
    tokenB: string;
  };

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  allocation: number;
}

export class CreateStrategyDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: StrategyType })
  @IsEnum(StrategyType)
  strategyType: StrategyType;

  @ApiProperty()
  configuration: {
    totalLiquidity: string;
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

  @ApiProperty({ type: [DexConfigurationDto] })
  @IsArray()
  dexConfigurations: DexConfigurationDto[];
}
