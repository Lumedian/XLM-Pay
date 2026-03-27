import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum, IsOptional, IsArray, IsDateString } from 'class-validator';
import { SuspiciousActivityType, SuspicionConfidence, SARPriority } from '@prisma/client';

export class SuspiciousActivityReportDto {
  @ApiProperty({
    description: 'SAR ID (regulatory identifier)',
    example: 'SAR-2024-001234',
  })
  @IsString()
  sarId: string;

  @ApiProperty({
    description: 'Filing date',
    example: '2024-01-20T00:00:00.000Z',
  })
  @IsDateString()
  filingDate: Date;

  @ApiProperty({
    description: 'Suspicious amount',
    example: 15000.00,
  })
  @IsNumber()
  suspiciousAmount: number;

  @ApiProperty({
    description: 'Type of suspicious activity',
    enum: SuspiciousActivityType,
    example: SuspiciousActivityType.STRUCTURING,
  })
  @IsEnum(SuspiciousActivityType)
  activityType: SuspiciousActivityType;

  @ApiProperty({
    description: 'Involved wallet addresses',
    example: ['GABC123...', 'GDEF456...'],
  })
  @IsArray()
  @IsString({ each: true })
  involvedAddresses: string[];

  @ApiProperty({
    description: 'Timeframe of suspicious activity',
    example: {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-15T23:59:59.999Z',
    },
  })
  timeframe: {
    start: Date;
    end: Date;
  };

  @ApiProperty({
    description: 'Detailed narrative of suspicious activity',
    example: 'Multiple transactions just under $10,000 conducted over 48-hour period, indicative of structuring.',
  })
  @IsString()
  narrative: string;

  @ApiProperty({
    description: 'Confidence level in suspicion',
    enum: SuspicionConfidence,
    example: SuspicionConfidence.HIGH,
    required: false,
  })
  @IsOptional()
  @IsEnum(SuspicionConfidence)
  confidence?: SuspicionConfidence;

  @ApiProperty({
    description: 'Investigation ID',
    example: 'INV-2024-567',
    required: false,
  })
  @IsOptional()
  @IsString()
  investigationId?: string;

  @ApiProperty({
    description: 'SAR priority',
    enum: SARPriority,
    example: SARPriority.HIGH,
    required: false,
  })
  @IsOptional()
  @IsEnum(SARPriority)
  priority?: SARPriority;
}

export class CreateSARDto {
  @ApiProperty({
    description: 'Report ID',
    example: 'report_456',
  })
  @IsString()
  reportId: string;

  @ApiProperty({
    description: 'Suspicious activity report data',
    type: SuspiciousActivityReportDto,
  })
  sar: SuspiciousActivityReportDto;
}

export class SuspiciousPatternDto {
  @ApiProperty({
    description: 'Pattern type detected',
    example: 'STRUCTURING_BELOW_THRESHOLD',
  })
  @IsString()
  patternType: string;

  @ApiProperty({
    description: 'Addresses involved in pattern',
    example: ['GABC123...', 'GDEF456...'],
  })
  @IsArray()
  @IsString({ each: true })
  addresses: string[];

  @ApiProperty({
    description: 'Pattern detection confidence',
    example: 0.85,
  })
  @IsNumber()
  confidence: number;

  @ApiProperty({
    description: 'Timeframe of pattern',
    example: {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-15T23:59:59.999Z',
    },
  })
  timeframe: {
    start: Date;
    end: Date;
  };

  @ApiProperty({
    description: 'Pattern details and evidence',
    example: {
      totalTransactions: 25,
      totalAmount: 95000.00,
      averageTransactionAmount: 3800.00,
      frequency: 'HIGH',
    },
  })
  details: any;
}
