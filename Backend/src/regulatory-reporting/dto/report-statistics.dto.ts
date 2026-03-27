import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReportStatisticsDto {
  @ApiProperty({
    description: 'Jurisdiction filter for statistics',
    example: 'FINRA',
    required: false,
  })
  @IsOptional()
  @IsString()
  jurisdiction?: string;
}
