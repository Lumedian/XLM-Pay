import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TENANT_PRICING_CENTS } from './constants/tenant-pricing.constants';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { TenantManagementService } from './tenant-management.service';
import { USAGE_METRICS } from './tenancy.types';
import { resolveDateRange } from './tenant.utils';

@Injectable()
export class TenantBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  async getBillingSummary(query: DateRangeQueryDto) {
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

    const breakdown = usageRows.map((row) => {
      const quantity = row._sum.quantity || 0;
      const rateCents = TENANT_PRICING_CENTS[row.metric];
      return {
        metric: row.metric,
        quantity,
        rateCents,
        amountCents: quantity * rateCents,
      };
    });

    const amountCents = breakdown.reduce((sum, row) => sum + row.amountCents, 0);

    const snapshot = await this.prisma.tenantBillingSnapshot.upsert({
      where: {
        tenantId_periodStart_periodEnd: {
          tenantId: tenant.id,
          periodStart: range.from,
          periodEnd: range.to,
        },
      },
      update: {
        amountCents,
        breakdown: breakdown as any,
      },
      create: {
        tenantId: tenant.id,
        periodStart: range.from,
        periodEnd: range.to,
        amountCents,
        breakdown: breakdown as any,
      },
    });

    const metricTotals = USAGE_METRICS.reduce<Record<string, number>>((acc, metric) => {
      acc[metric] = 0;
      return acc;
    }, {});

    for (const row of breakdown) {
      metricTotals[row.metric] = row.quantity;
    }

    return {
      tenantId: tenant.id,
      from: range.from,
      to: range.to,
      amountCents,
      metricTotals,
      snapshot,
    };
  }
}
