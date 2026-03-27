import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsArray, IsDateString } from 'class-validator';
import { ExaminerAccessLevel, ExaminerStatus } from '@prisma/client';

export class CreateExaminerAccessDto {
  @ApiProperty({
    description: 'Examiner ID from regulatory body',
    example: 'FINRA_EXAM_001',
  })
  @IsString()
  examinerId: string;

  @ApiProperty({
    description: 'Examiner name',
    example: 'John Smith',
  })
  @IsString()
  examinerName: string;

  @ApiProperty({
    description: 'Regulatory organization',
    example: 'FINRA',
  })
  @IsString()
  organization: string;

  @ApiProperty({
    description: 'Access level',
    enum: ExaminerAccessLevel,
    example: ExaminerAccessLevel.VIEW_ONLY,
  })
  @IsEnum(ExaminerAccessLevel)
  accessLevel: ExaminerAccessLevel;

  @ApiProperty({
    description: 'Specific permissions granted',
    example: {
      canViewTradeReports: true,
      canViewSARs: true,
      canViewComplianceReports: true,
      canDownloadReports: false,
      canExportData: false,
    },
  })
  permissions: any;

  @ApiProperty({
    description: 'Access validity period start',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsDateString()
  validFrom: Date;

  @ApiProperty({
    description: 'Access validity period end',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsDateString()
  validUntil: Date;
}

export class UpdateExaminerAccessDto {
  @ApiProperty({
    description: 'Access level',
    enum: ExaminerAccessLevel,
    required: false,
  })
  @IsOptional()
  @IsEnum(ExaminerAccessLevel)
  accessLevel?: ExaminerAccessLevel;

  @ApiProperty({
    description: 'Permissions',
    required: false,
  })
  @IsOptional()
  permissions?: any;

  @ApiProperty({
    description: 'New validity end date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  validUntil?: Date;

  @ApiProperty({
    description: 'Examiner status',
    enum: ExaminerStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ExaminerStatus)
  status?: ExaminerStatus;
}

export class ExaminerLoginDto {
  @ApiProperty({
    description: 'Examiner ID',
    example: 'FINRA_EXAM_001',
  })
  @IsString()
  examinerId: string;

  @ApiProperty({
    description: 'Temporary access token or password',
    example: 'temp_token_123456',
  })
  @IsString()
  accessToken: string;

  @ApiProperty({
    description: 'IP address of login attempt',
    example: '192.168.1.100',
  })
  @IsString()
  ipAddress: string;

  @ApiProperty({
    description: 'User agent string',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class ExaminerAccessLogDto {
  @ApiProperty({
    description: 'Access log ID',
    example: 'log_123',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Action performed',
    example: 'VIEW_REPORT',
  })
  @IsString()
  action: string;

  @ApiProperty({
    description: 'Resource type accessed',
    example: 'REGULATORY_REPORT',
  })
  @IsString()
  resourceType: string;

  @ApiProperty({
    description: 'Resource ID accessed',
    example: 'report_456',
  })
  @IsString()
  resourceId: string;

  @ApiProperty({
    description: 'Access success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Error message if access failed',
    example: 'Access denied - insufficient permissions',
    required: false,
  })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiProperty({
    description: 'Timestamp of access attempt',
    example: '2024-01-15T10:30:00.000Z',
  })
  @IsDateString()
  timestamp: Date;
}
