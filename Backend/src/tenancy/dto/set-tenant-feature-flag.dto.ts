import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SetTenantFeatureFlagDto {
  @IsString()
  key: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
