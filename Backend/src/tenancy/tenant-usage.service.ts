import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { RecordTenantUsageDto } from './dto/record-tenant-usage.dto';
import { TenantManagementService } from './tenant-management.service';
import { USAGE_METRICS } from './tenancy.types';
import { resolveDateRange } from './tenant.utils';

@Injectable()
export class TenantUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  async recordUsage(dto: RecordTenantUsageDto) {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    return this.recordUsageForTenantId(tenant.id, dto);
  }

  async recordUsageForTenantId(tenantId: string, dto: RecordTenantUsageDto) {
    return this.prisma.tenantUsageEvent.create({
      data: {
        tenantId,
        metric: dto.metric,
        quantity: dto.quantity || 1,
        metadata: dto.metadata as any,
      },
    });
  }

  async getUsageSummary(query: DateRangeQueryDto) {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    const range = resolveDateRange(query.from, query.to);

    const usageRows = await this.prisma.tenantUsageEvent.groupBy({
      by: ['metric'],
      where: {
        tenantId: tenant.id,
        recordedAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const totals = USAGE_METRICS.reduce<Record<string, number>>((acc, metric) => {
      acc[metric] = 0;
      return acc;
    }, {});

    for (const row of usageRows) {
      totals[row.metric] = row._sum.quantity || 0;
    }

    return {
      tenantId: tenant.id,
      from: range.from,
      to: range.to,
      totals,
    };
  }
}
