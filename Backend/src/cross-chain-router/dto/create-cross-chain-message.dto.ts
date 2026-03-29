import { IsString, IsOptional, IsNumber, IsEnum, MinLength, IsArray } from 'class-validator';
import { SupportedBlockchain } from '@prisma/client';

export class CreateCrossChainMessageDto {
  @IsEnum(SupportedBlockchain)
  sourceChain: SupportedBlockchain;

  @IsEnum(SupportedBlockchain)
  destChain: SupportedBlockchain;

  @IsString()
  @MinLength(1)
  senderAddress: string;

  @IsString()
  @MinLength(1)
  recipientAddress: string;

  @IsOptional()
  @IsString()
  assetSymbol?: string;

  @IsOptional()
  @IsString()
  assetAmount?: string;

  @IsOptional()
  @IsString()
  contractAddress?: string;

  @IsOptional()
  @IsString()
  functionSelector?: string;

  @IsOptional()
  @IsArray()
  functionArgs?: any[];

  @IsOptional()
  payload?: any;
}

export class QueryRouteDto {
  @IsEnum(SupportedBlockchain)
  sourceChain: SupportedBlockchain;

  @IsEnum(SupportedBlockchain)
  destChain: SupportedBlockchain;

  @IsOptional()
  @IsString()
  assetSymbol?: string;

  @IsOptional()
  @IsString()
  amount?: string;
}

export class RegisterValidatorDto {
  @IsString()
  @MinLength(1)
  validatorAddress: string;

  @IsString()
  chainId: string;

  @IsString()
  stakedAmount: string;
}

export class SlashValidatorDto {
  @IsString()
  validatorAddress: string;

  @IsString()
  chainId: string;

  @IsString()
  reason: string; // e.g., "double_sign", "missed_attestation"

  @IsNumber()
  slashPercentage: number; // e.g., 10.5
}

export class RegisterChainAdapterDto {
  @IsEnum(SupportedBlockchain)
  blockchain: SupportedBlockchain;

  @IsString()
  rpcEndpoint: string;

  @IsOptional()
  @IsString()
  wsEndpoint?: string;

  @IsString()
  chainId: string;

  @IsNumber()
  avgBlockTime: number;

  @IsNumber()
  finalityBlocks: number;
}
