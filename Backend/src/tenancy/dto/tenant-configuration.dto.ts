import { IsObject, IsOptional, IsString } from 'class-validator';

export class TenantConfigurationDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  billingEmail?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timeZone?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
