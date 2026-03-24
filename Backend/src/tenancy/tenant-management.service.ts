import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, Tenant, TenantFeatureFlag } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { TenantConfigurationDto } from './dto/tenant-configuration.dto';
import { SetTenantFeatureFlagDto } from './dto/set-tenant-feature-flag.dto';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantManagementService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultTenant();
  }

  async ensureDefaultTenant(): Promise<Tenant> {
    return this.prisma.tenant.upsert({
      where: { slug: process.env.DEFAULT_TENANT_SLUG || 'platform' },
      update: {
        name: process.env.DEFAULT_TENANT_NAME || 'Platform Tenant',
        plan: process.env.DEFAULT_TENANT_PLAN || 'standard',
      },
      create: {
        slug: process.env.DEFAULT_TENANT_SLUG || 'platform',
        name: process.env.DEFAULT_TENANT_NAME || 'Platform Tenant',
        plan: process.env.DEFAULT_TENANT_PLAN || 'standard',
        configuration: {
          create: {
            displayName: process.env.DEFAULT_TENANT_NAME || 'Platform Tenant',
            onboardingCompletedAt: new Date(),
            settings: {},
          },
        },
      },
      include: {
        configuration: true,
      },
    });
  }

  async getCurrentTenant(): Promise<Tenant> {
    const identifier =
      this.tenantContextService.getTenantIdentifier() ||
      process.env.DEFAULT_TENANT_SLUG ||
      'platform';

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${identifier}' was not found`);
    }

    return tenant;
  }

  async getTenantById(tenantId: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${tenantId}' was not found`);
    }

    return tenant;
  }

  async getTenantOverview(): Promise<Prisma.TenantGetPayload<{
    include: { configuration: true; featureFlags: true };
  }>> {
    const tenant = await this.getCurrentTenant();

    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
      include: {
        configuration: true,
        featureFlags: true,
      },
    });
  }

  async updateCurrentTenantConfiguration(dto: TenantConfigurationDto) {
    const tenant = await this.getCurrentTenant();

    return this.prisma.tenantConfiguration.upsert({
      where: { tenantId: tenant.id },
      update: dto,
      create: {
        tenantId: tenant.id,
        ...dto,
        onboardingCompletedAt: new Date(),
      },
    });
  }

  async setCurrentTenantFeatureFlag(dto: SetTenantFeatureFlagDto): Promise<TenantFeatureFlag> {
    const tenant = await this.getCurrentTenant();

    return this.prisma.tenantFeatureFlag.upsert({
      where: {
        tenantId_key: {
          tenantId: tenant.id,
          key: dto.key,
        },
      },
      update: {
        enabled: dto.enabled,
        description: dto.description,
      },
      create: {
        tenantId: tenant.id,
        key: dto.key,
        enabled: dto.enabled,
        description: dto.description,
      },
    });
  }
}
