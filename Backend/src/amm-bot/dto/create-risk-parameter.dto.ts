import { IsString, IsEnum, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RiskType } from '../entities/risk-parameter.entity';

export class CreateRiskParameterDto {
  @ApiProperty({ enum: RiskType })
  @IsEnum(RiskType)
  riskType: RiskType;

  @ApiProperty()
  @IsString()
  threshold: string;

  @ApiProperty({ required: false })
  @IsOptional()
  parameters?: {
    maxPercentage?: number;
    timeWindow?: number;
    lookbackPeriod?: number;
    tokens?: string[];
    dexes?: string[];
    rebalanceAction?: 'reduce_position' | 'close_position' | 'pause_strategy';
  };

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  alertConfig?: {
    enabled: boolean;
    channels: string[];
    threshold?: string;
    cooldownPeriod?: number;
  };
}
