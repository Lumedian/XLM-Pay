import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { RecordTenantUsageDto } from './dto/record-tenant-usage.dto';
import { SetTenantFeatureFlagDto } from './dto/set-tenant-feature-flag.dto';
import { TenantConfigurationDto } from './dto/tenant-configuration.dto';
import { TenantBillingService } from './tenant-billing.service';
import { TenantManagementService } from './tenant-management.service';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { TenantUsageService } from './tenant-usage.service';

@Controller('tenancy')
export class TenantController {
  constructor(
    private readonly tenantOnboardingService: TenantOnboardingService,
    private readonly tenantManagementService: TenantManagementService,
    private readonly tenantUsageService: TenantUsageService,
    private readonly tenantBillingService: TenantBillingService,
  ) {}

  @Post('tenants')
  async onboardTenant(@Body() dto: OnboardTenantDto) {
    return this.tenantOnboardingService.onboardTenant(dto);
  }

  @Get('current')
  async getCurrentTenant() {
    return this.tenantManagementService.getTenantOverview();
  }

  @Put('configuration')
  async updateConfiguration(@Body() dto: TenantConfigurationDto) {
    return this.tenantManagementService.updateCurrentTenantConfiguration(dto);
  }

  @Put('feature-flags')
  async setFeatureFlag(@Body() dto: SetTenantFeatureFlagDto) {
    return this.tenantManagementService.setCurrentTenantFeatureFlag(dto);
  }

  @Post('usage-events')
  async recordUsage(@Body() dto: RecordTenantUsageDto) {
    return this.tenantUsageService.recordUsage(dto);
  }

  @Get('usage')
  async getUsage(@Query() query: DateRangeQueryDto) {
    return this.tenantUsageService.getUsageSummary(query);
  }

  @Get('billing')
  async getBilling(@Query() query: DateRangeQueryDto) {
    return this.tenantBillingService.getBillingSummary(query);
  }
}
