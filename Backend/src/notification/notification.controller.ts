import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TenantManagementService } from '../tenancy/tenant-management.service';

@Controller('notifications')
export class NotificationController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly tenantManagementService: TenantManagementService,
    ) { }

    @Get('settings/:userId')
    async getSettings(@Param('userId') userId: string) {
        const tenant = await this.tenantManagementService.getCurrentTenant();
        return this.prisma.notificationSetting.upsert({
            where: {
                tenantId_userId: {
                    tenantId: tenant.id,
                    userId,
                },
            },
            update: {},
            create: { tenantId: tenant.id, userId },
        });
    }

    @Put('settings/:userId')
    async updateSettings(
        @Param('userId') userId: string,
        @Body() settings: {
            emailEnabled?: boolean;
            pushEnabled?: boolean;
            notifyContributions?: boolean;
            notifyMilestones?: boolean;
            notifyDeadlines?: boolean;
        },
    ) {
        const tenant = await this.tenantManagementService.getCurrentTenant();
        return this.prisma.notificationSetting.upsert({
            where: {
                tenantId_userId: {
                    tenantId: tenant.id,
                    userId,
                },
            },
            update: settings,
            create: {
                tenantId: tenant.id,
                userId,
                ...settings,
            },
        });
    }

    @Post('subscribe/:userId')
    async subscribeToPush(
        @Param('userId') userId: string,
        @Body() subscription: any,
    ) {
        const tenant = await this.tenantManagementService.getCurrentTenant();
        await this.prisma.user.updateMany({
            where: { id: userId, tenantId: tenant.id },
            data: { pushSubscription: subscription },
        });
        return { success: true };
    }
}
