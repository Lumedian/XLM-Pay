import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { calculateTrustScore } from './calculators/trust-score.calculator';
import { TenantManagementService } from '../tenancy/tenant-management.service';

@Injectable()
export class ReputationService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly tenantManagementService: TenantManagementService,
	) {}

	async updateTrustScore(userId: string, tenantId?: string): Promise<number> {
		const tenant = tenantId
			? await this.tenantManagementService.getTenantById(tenantId)
			: await this.tenantManagementService.getCurrentTenant();
		const score = await calculateTrustScore(this.prisma, userId, tenant.id);
		await this.prisma.user.updateMany({
			where: { id: userId, tenantId: tenant.id },
			data: { trustScore: score },
		});
		return score;
	}
}
