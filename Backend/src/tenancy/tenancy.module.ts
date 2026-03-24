import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from '../database.module';
import { TenantController } from './tenant.controller';
import { TenantBillingService } from './tenant-billing.service';
import { TenantContextService } from './tenant-context.service';
import { TenantManagementService } from './tenant-management.service';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { TenantUsageInterceptor } from './tenant-usage.interceptor';
import { TenantUsageService } from './tenant-usage.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TenantController],
  providers: [
    TenantContextService,
    TenantManagementService,
    TenantOnboardingService,
    TenantUsageService,
    TenantBillingService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantUsageInterceptor,
    },
  ],
  exports: [
    TenantContextService,
    TenantManagementService,
    TenantUsageService,
    TenantBillingService,
  ],
})
export class TenancyModule {}
