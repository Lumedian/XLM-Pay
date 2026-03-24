import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { slugifyTenantName } from './tenant.utils';

@Injectable()
export class TenantOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async onboardTenant(dto: OnboardTenantDto) {
    const slug = dto.slug ? slugifyTenantName(dto.slug) : slugifyTenantName(dto.name);

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (existingTenant) {
      throw new ConflictException(`Tenant slug '${slug}' already exists`);
    }

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: dto.name,
          plan: dto.plan || 'standard',
          metadata: dto.metadata as any,
        },
      });

      const configuration = await tx.tenantConfiguration.create({
        data: {
          tenantId: tenant.id,
          displayName: dto.displayName || dto.name,
          billingEmail: dto.billingEmail,
          locale: dto.locale,
          timeZone: dto.timeZone,
          settings: (dto.settings || {}) as any,
          onboardingCompletedAt: new Date(),
        },
      });

      const featureFlags = dto.featureFlags?.length
        ? await Promise.all(
            dto.featureFlags.map((featureFlag) =>
              tx.tenantFeatureFlag.create({
                data: {
                  tenantId: tenant.id,
                  key: featureFlag.key,
                  enabled: featureFlag.enabled,
                  description: featureFlag.description,
                },
              }),
            ),
          )
        : [];

      return {
        tenant,
        configuration,
        featureFlags,
      };
    });
  }
}
