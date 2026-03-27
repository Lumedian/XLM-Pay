import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { RegulatoryReportType, ReportStatus } from '@prisma/client';

export class ReportQueryDto {
  @ApiProperty({
    description: 'Report type filter',
    enum: RegulatoryReportType,
    required: false,
  })
  @IsOptional()
  @IsEnum(RegulatoryReportType)
  type?: RegulatoryReportType;

  @ApiProperty({
    description: 'Report status filter',
    enum: ReportStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}
