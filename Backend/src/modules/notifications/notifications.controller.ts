import { Controller, Get, Post, Body, Param, Put, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { NotificationType } from './entities/notification.entity';
import { NotificationChannel } from './entities/notification-preference.entity';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @ApiOperation({ summary: 'Get notification history' })
    @Get()
    async getHistory(
        @GetUser() user: User,
        @Query('limit') limit?: number,
        @Query('offset') offset?: number,
    ) {
        return this.notificationsService.getHistory(user.id, limit || 20, offset || 0);
    }

    @ApiOperation({ summary: 'Get notification preferences' })
    @Get('preferences')
    async getPreferences(@GetUser() user: User) {
        return this.notificationsService.getPreferences(user.id);
    }

    @ApiOperation({ summary: 'Update notification preference' })
    @Put('preferences')
    async updatePreference(
        @GetUser() user: User,
        @Body() body: { type: NotificationType; channel: NotificationChannel; isEnabled: boolean },
    ) {
        return this.notificationsService.updatePreference(user.id, body.type, body.channel, body.isEnabled);
    }

    @ApiOperation({ summary: 'Mark notification as read' })
    @Post(':id/read')
    async markAsRead(@Param('id') id: string) {
        return this.notificationsService.markAsRead(id);
    }

    @ApiOperation({ summary: 'Mark all notifications as read' })
    @Post('read-all')
    async markAllAsRead(@GetUser() user: User) {
        return this.notificationsService.markAllAsRead(user.id);
    }
}
