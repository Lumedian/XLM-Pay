import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsDateString, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class TradeReportRecordDto {
  @ApiProperty({
    description: 'Transaction hash',
    example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  })
  @IsString()
  transactionHash: string;

  @ApiProperty({
    description: 'Trade date',
    example: '2024-01-15T10:30:00.000Z',
  })
  @IsDateString()
  tradeDate: Date;

  @ApiProperty({
    description: 'Trading symbol',
    example: 'BTCUSD',
  })
  @IsString()
  symbol: string;

  @ApiProperty({
    description: 'Quantity traded',
    example: 1.5,
  })
  @IsNumber()
  quantity: number;

  @ApiProperty({
    description: 'Trade price',
    example: 45000.00,
  })
  @IsNumber()
  price: number;

  @ApiProperty({
    description: 'Total trade value',
    example: 67500.00,
  })
  @IsNumber()
  totalValue: number;

  @ApiProperty({
    description: 'Buyer wallet address',
    example: 'GABC1234567890DEF1234567890DEF1234567890',
  })
  @IsString()
  buyerAddress: string;

  @ApiProperty({
    description: 'Seller wallet address',
    example: 'GDEF1234567890ABC1234567890ABC1234567890',
  })
  @IsString()
  sellerAddress: string;

  @ApiProperty({
    description: 'Trading venue',
    example: 'Stellar DEX',
  })
  @IsString()
  venue: string;

  @ApiProperty({
    description: 'Settlement date',
    example: '2024-01-15T18:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  settlementDate?: Date;

  @ApiProperty({
    description: 'Reportable entity',
    example: 'BROKER_A',
  })
  @IsString()
  reportableEntity: string;
}

export class CreateTradeReportDto {
  @ApiProperty({
    description: 'Report ID',
    example: 'report_123',
  })
  @IsString()
  reportId: string;

  @ApiProperty({
    description: 'Array of trade records',
    type: [TradeReportRecordDto],
  })
  @IsArray()
  @Type(() => TradeReportRecordDto)
  trades: TradeReportRecordDto[];
}

export class FinraReportFormatDto {
  @ApiProperty({
    description: 'FINRA submission header',
    example: {
      submittingFirm: 'STELLAR SECURITIES',
      contactInfo: {
        name: 'John Doe',
        phone: '555-0123',
        email: 'compliance@stellar.com',
      },
      submissionType: 'EQUITY_TRADES',
    },
  })
  header: any;

  @ApiProperty({
    description: 'Trade records in FINRA format',
    type: [Object],
  })
  trades: any[];

  @ApiProperty({
    description: 'Report summary',
    example: {
      totalTrades: 1500,
      totalVolume: 2500000.00,
      reportingPeriod: 'Q1 2024',
    },
  })
  summary: any;
}
