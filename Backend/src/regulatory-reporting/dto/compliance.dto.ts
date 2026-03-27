import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ComplianceCertificationType, ComplianceStatus } from '@prisma/client';

export class ComplianceReportItemDto {
  @ApiProperty({
    description: 'Type of compliance certification',
    enum: ComplianceCertificationType,
    example: ComplianceCertificationType.AML_PROGRAM,
  })
  @IsEnum(ComplianceCertificationType)
  certificationType: ComplianceCertificationType;

  @ApiProperty({
    description: 'Certification period',
    example: {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-03-31T23:59:59.999Z',
    },
  })
  period: {
    start: Date;
    end: Date;
  };

  @ApiProperty({
    description: 'User ID of certifier',
    example: 'user_123',
  })
  @IsString()
  certifiedBy: string;

  @ApiProperty({
    description: 'Certification date',
    example: '2024-04-15T10:00:00.000Z',
  })
  @IsDateString()
  certificationDate: Date;

  @ApiProperty({
    description: 'Compliance findings',
    example: {
      totalTransactionsReviewed: 10000,
      suspiciousTransactionsIdentified: 15,
      sarFiled: 3,
      complianceScore: 95.5,
    },
    required: false,
  })
  @IsOptional()
  findings?: any;

  @ApiProperty({
    description: 'Improvement recommendations',
    example: [
      'Enhance transaction monitoring thresholds',
      'Implement real-time pattern detection',
      'Staff training on emerging money laundering techniques',
    ],
    required: false,
  })
  @IsOptional()
  recommendations?: any;

  @ApiProperty({
    description: 'User ID of approver',
    example: 'user_456',
    required: false,
  })
  @IsOptional()
  @IsString()
  approvedBy?: string;

  @ApiProperty({
    description: 'Approval date',
    example: '2024-04-16T14:30:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  approvedAt?: Date;
}

export class CreateComplianceReportDto {
  @ApiProperty({
    description: 'Report ID',
    example: 'report_789',
  })
  @IsString()
  reportId: string;

  @ApiProperty({
    description: 'Compliance report items',
    type: [ComplianceReportItemDto],
  })
  complianceItems: ComplianceReportItemDto[];
}

export class QuarterlyComplianceDto {
  @ApiProperty({
    description: 'Quarter and year',
    example: 'Q1 2024',
  })
  @IsString()
  quarter: string;

  @ApiProperty({
    description: 'Quarter start date',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsDateString()
  quarterStart: Date;

  @ApiProperty({
    description: 'Quarter end date',
    example: '2024-03-31T23:59:59.999Z',
  })
  @IsDateString()
  quarterEnd: Date;

  @ApiProperty({
    description: 'AML program compliance status',
    example: {
      status: ComplianceStatus.CERTIFIED,
      score: 98.5,
      lastAudit: '2024-03-15T00:00:00.000Z',
      nextAudit: '2024-06-15T00:00:00.000Z',
    },
  })
  amlProgram: any;

  @ApiProperty({
    description: 'KYC compliance status',
    example: {
      status: ComplianceStatus.CERTIFIED,
      totalCustomers: 5000,
      verifiedCustomers: 4850,
      pendingVerifications: 150,
      complianceRate: 97.0,
    },
  })
  kycCompliance: any;

  @ApiProperty({
    description: 'Transaction monitoring effectiveness',
    example: {
      status: ComplianceStatus.CERTIFIED,
      totalTransactions: 100000,
      alertsGenerated: 1250,
      falsePositives: 950,
      genuineAlerts: 300,
      sarFiled: 25,
    },
  })
  transactionMonitoring: any;

  @ApiProperty({
    description: 'Reporting adequacy assessment',
    example: {
      status: ComplianceStatus.CERTIFIED,
      regulatoryReportsFiled: 12,
      filingAccuracy: 99.8,
      timelinessScore: 100,
      regulatoryFeedback: 'COMPLIANT',
    },
  })
  reportingAdequacy: any;
}
