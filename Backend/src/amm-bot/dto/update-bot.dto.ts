import { IsString, IsEnum, IsOptional, IsObject, IsArray, Type } from 'class-validator';
import { BotStatus, DexType } from '../interfaces/amm-bot.interface';
import { StrategyConfigDto } from './create-bot.dto';

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  @Type(() => StrategyConfigDto)
  strategy?: StrategyConfigDto;

  @IsOptional()
  @IsEnum(BotStatus)
  status?: BotStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(DexType, { each: true })
  targetDexes?: DexType[];
}

export class RebalanceBotDto {
  @IsOptional()
  @IsNumber()
  amount0?: number;

  @IsOptional()
  @IsNumber()
  amount1?: number;

  @IsOptional()
  @IsNumber()
  newTickLower?: number;

  @IsOptional()
  @IsNumber()
  newTickUpper?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
