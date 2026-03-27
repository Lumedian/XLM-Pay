import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportStatus } from '@prisma/client';

export class UpdateReportStatusDto {
  @ApiProperty({
    description: 'New report status',
    enum: ReportStatus,
    example: ReportStatus.SUBMITTED,
  })
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @ApiProperty({
    description: 'Reason for status change (optional)',
    example: 'Successfully submitted to FINRA',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
