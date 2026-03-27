import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional, IsDateString } from 'class-validator';
import { RegulatoryReportType, ReportFormat } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({
    description: 'Type of regulatory report',
    enum: RegulatoryReportType,
    example: RegulatoryReportType.TRADE_REPORTING,
  })
  @IsEnum(RegulatoryReportType)
  type: RegulatoryReportType;

  @ApiProperty({
    description: 'Regulatory jurisdiction (FINRA, NFA, SEC, etc.)',
    example: 'FINRA',
  })
  @IsString()
  jurisdiction: string;

  @ApiProperty({
    description: 'Report period start and end dates',
    example: {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-03-31T23:59:59.999Z',
    },
  })
  reportPeriod: {
    start: Date;
    end: Date;
  };

  @ApiProperty({
    description: 'Report format',
    enum: ReportFormat,
    example: ReportFormat.XML,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;
}
