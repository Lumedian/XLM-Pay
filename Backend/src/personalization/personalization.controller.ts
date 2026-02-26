import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../auth/roles.enum';
import { EventTrackingService } from './services/event-tracking.service';
import { RecommendationService } from './services/recommendation.service';
import { RuleEngineService } from './services/rule-engine.service';
import { ExperimentService } from './services/experiment.service';
import { UserEventType } from './entities/user-event.entity';
import { RuleStatus } from './entities/personalization-rule.entity';

@ApiTags('Personalization')
@Controller('personalization')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PersonalizationController {
  constructor(
    private readonly events: EventTrackingService,
    private readonly recs: RecommendationService,
    private readonly rules: RuleEngineService,
    private readonly experiments: ExperimentService,
  ) {}

  @Post('events')
  @ApiOperation({ summary: 'Record a user event' })
  @Roles(Role.USER, Role.ADMIN, Role.SUPERADMIN)
  async recordEvent(
    @Body()
    body: {
      tenantId?: string | null;
      userId?: string | null;
      eventType: UserEventType;
      itemId?: string | null;
      sessionId?: string | null;
      page?: string | null;
      experimentId?: string | null;
      variant?: string | null;
      metadata?: Record<string, any> | null;
    },
  ) {
    return this.events.recordEvent(body);
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Get recommendations for a user' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Roles(Role.USER, Role.ADMIN, Role.SUPERADMIN)
  async getRecommendations(
    @Query('userId') userId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.recs.getRecommendations({
      userId: userId ?? null,
      tenantId: tenantId ?? null,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('rules')
  @ApiOperation({ summary: 'List personalization rules' })
  @ApiQuery({ name: 'tenantId', required: false })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async listRules(@Query('tenantId') tenantId?: string) {
    return this.rules.listRules(tenantId ?? null);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create a personalization rule' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async createRule(
    @Body()
    body: {
      name: string;
      description?: string;
      priority?: number;
      status?: RuleStatus;
      conditions: any;
      actions: any;
      tenantId?: string | null;
    },
  ) {
    return this.rules.createRule(body);
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Update a personalization rule' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async updateRule(@Param('id') id: string, @Body() patch: any) {
    return this.rules.updateRule(id, patch);
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete a personalization rule' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async deleteRule(@Param('id') id: string) {
    return this.rules.deleteRule(id);
  }

  @Post('rules:evaluate')
  @ApiOperation({ summary: 'Evaluate rules for a user context' })
  @Roles(Role.USER, Role.ADMIN, Role.SUPERADMIN)
  async evaluate(
    @Body()
    body: {
      userId?: string | null;
      tenantId?: string | null;
      attributes?: Record<string, any>;
    },
  ) {
    return this.rules.evaluate({
      userId: body.userId ?? null,
      tenantId: body.tenantId ?? null,
      attributes: body.attributes ?? {},
    });
  }

  @Post('experiments')
  @ApiOperation({ summary: 'Create an experiment' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async createExperiment(
    @Body()
    body: {
      key: string;
      name: string;
      description?: string;
      variants: Array<{ name: string; weight: number }>;
      tenantId?: string | null;
    },
  ) {
    return this.experiments.createExperiment(body);
  }

  @Get('experiments')
  @ApiOperation({ summary: 'List experiments' })
  @ApiQuery({ name: 'tenantId', required: false })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async listExperiments(@Query('tenantId') tenantId?: string) {
    return this.experiments.listExperiments(tenantId ?? null);
  }

  @Post('experiments/:key/start')
  @ApiOperation({ summary: 'Start experiment' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async start(@Param('key') key: string) {
    return this.experiments.startExperiment(key);
  }

  @Post('experiments/:key/pause')
  @ApiOperation({ summary: 'Pause experiment' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async pause(@Param('key') key: string) {
    return this.experiments.pauseExperiment(key);
  }

  @Post('experiments/:key/assign')
  @ApiOperation({ summary: 'Assign a user to a variant' })
  @Roles(Role.USER, Role.ADMIN, Role.SUPERADMIN)
  async assign(
    @Param('key') key: string,
    @Body() body: { userId: string; tenantId?: string | null },
  ) {
    return this.experiments.assignVariant({
      experimentKey: key,
      userId: body.userId,
      tenantId: body.tenantId ?? null,
    });
  }

  @Get('experiments/:key/report')
  @ApiOperation({ summary: 'Get experiment report' })
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  async report(@Param('key') key: string) {
    return this.experiments.getReport(key);
  }
}
