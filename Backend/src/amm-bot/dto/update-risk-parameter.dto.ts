import { IsString, IsEnum, IsNumber, IsOptional, Min, Max, PartialType } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RiskType } from '../entities/risk-parameter.entity';
import { CreateRiskParameterDto } from './create-risk-parameter.dto';

export class UpdateRiskParameterDto extends PartialType(CreateRiskParameterDto) {
  @ApiProperty({ enum: RiskType, required: false })
  @IsOptional()
  @IsEnum(RiskType)
  riskType?: RiskType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  threshold?: string;

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
