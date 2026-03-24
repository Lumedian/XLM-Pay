import { Controller, Get, Param } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantManagementService } from './tenancy/tenant-management.service';

@Controller('api/user')
export class UserController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  @Get(':id')
  async getUser(@Param('id') id: string) {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!user) return { error: 'User not found' };
    // Only return relevant fields
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      reputationScore: user.reputationScore,
      trustScore: user.trustScore,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
