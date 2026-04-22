import { IsEnum, IsNumber, IsString, IsOptional, Min, Max } from 'class-validator';

export enum BudgetOperation {
  QUERY = 'query',
  RESERVE = 'reserve',
  RELEASE = 'release',
  RESET = 'reset',
}

export class PrivacyBudgetDto {
  @IsString()
  userId: string;

  @IsNumber()
  @Min(0.1)
  @Max(1.0)
  epsilon: number;

  @IsEnum(BudgetOperation)
  operation: BudgetOperation;

  @IsString()
  @IsOptional()
  queryId?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class PrivacyBudgetResponseDto {
  userId: string;
  totalBudget: number;
  usedBudget: number;
  remainingBudget: number;
  lastReset: Date;
  queries: PrivacyBudgetQueryDto[];
}

export class PrivacyBudgetQueryDto {
  queryId: string;
  epsilon: number;
  timestamp: Date;
  description: string;
  status: 'completed' | 'reserved' | 'failed';
}
