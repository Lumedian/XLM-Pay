import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, Min, Max, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketCategory, DiscussionCategory } from '@prisma/client';

export class CreateMarketDto {
  @ApiProperty({ description: 'Market title, e.g. "First verified person to reach 150 years old before 2075"' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Detailed description of the resolution criteria' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: MarketCategory, description: 'Market category' })
  @IsEnum(MarketCategory)
  category: MarketCategory;

  @ApiPropertyOptional({ description: 'ISO 8601 date when the market resolves' })
  @IsOptional()
  @IsDateString()
  resolveDate?: string;
}

export class PlacePositionDto {
  @ApiProperty({ enum: ['YES', 'NO'], description: 'Position direction' })
  @IsEnum(['YES', 'NO'])
  position: 'YES' | 'NO';

  @ApiProperty({ description: 'Amount in USD to stake' })
  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class ResolveMarketDto {
  @ApiProperty({ description: 'True if the market resolves YES, false for NO' })
  resolution: boolean;
}

export class CreateExpertRatingDto {
  @ApiProperty({ description: 'Research paper ID to rate' })
  @IsString()
  @IsNotEmpty()
  researchId: string;

  @ApiProperty({ description: 'Expert full name' })
  @IsString()
  @IsNotEmpty()
  expertName: string;

  @ApiPropertyOptional({ description: 'Expert institution or affiliation' })
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiProperty({ description: 'Rating from 1 (poor) to 10 (exceptional)' })
  @IsNumber()
  @Min(1)
  @Max(10)
  rating: number;

  @ApiProperty({ description: 'Confidence level in the research (1–100)' })
  @IsNumber()
  @Min(1)
  @Max(100)
  confidence: number;

  @ApiPropertyOptional({ description: 'Expert commentary on the research' })
  @IsOptional()
  @IsString()
  commentary?: string;
}

export class CreateFundingAllocationDto {
  @ApiProperty({ description: 'Research paper ID to fund' })
  @IsString()
  @IsNotEmpty()
  researchId: string;

  @ApiProperty({ description: 'Amount to allocate' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Rationale for funding allocation' })
  @IsOptional()
  @IsString()
  rationale?: string;
}

export class CreateDiscussionDto {
  @ApiPropertyOptional({ description: 'Related research paper ID (optional)' })
  @IsOptional()
  @IsString()
  researchId?: string;

  @ApiProperty({ description: 'Discussion title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Discussion content (supports markdown)' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ enum: DiscussionCategory, description: 'Category type' })
  @IsEnum(DiscussionCategory)
  category: DiscussionCategory;
}

export class CreateReplyDto {
  @ApiProperty({ description: 'Reply content' })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ResearchQueryDto {
  @ApiPropertyOptional({ description: 'Filter by source (PUBMED, BIORXIV, MEDRXIV)' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Full-text search query' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter open-access only' })
  @IsOptional()
  openAccess?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: '1' })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page', default: '20' })
  @IsOptional()
  limit?: string;
}

export class TrialQueryDto {
  @ApiPropertyOptional({ description: 'Filter by intervention (e.g. metformin, rapamycin)' })
  @IsOptional()
  @IsString()
  intervention?: string;

  @ApiPropertyOptional({ description: 'Filter by trial status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by phase (PHASE1, PHASE2, etc.)' })
  @IsOptional()
  @IsString()
  phase?: string;

  @ApiPropertyOptional({ description: 'Page number', default: '1' })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page', default: '20' })
  @IsOptional()
  limit?: string;
}
