import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CdpService } from './cdp.service';
import {
  EventIngestionDto,
  SegmentQueryDto,
  SegmentCreateDto,
  UserProfileDto,
  ConsentUpdateDto,
} from './dto/cdp.dto';

@ApiTags('Customer Data Platform')
@Controller('cdp')
@UseGuards(JwtAuthGuard)
export class CdpController {
  constructor(private readonly cdpService: CdpService) {}

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Ingest events from web, mobile, or backend' })
  @ApiResponse({ status: 202, description: 'Event accepted for processing' })
  async ingestEvent(@Body() eventDto: EventIngestionDto) {
    return this.cdpService.ingestEvent(eventDto);
  }

  @Get('users/:userId/profile')
  @ApiOperation({ summary: 'Get unified user profile with segments' })
  async getUserProfile(@Param('userId') userId: string): Promise<UserProfileDto> {
    return this.cdpService.getUserProfile(userId);
  }

  @Get('segments')
  @ApiOperation({ summary: 'List all segments' })
  async listSegments(@Query('tenantId') tenantId?: string) {
    return this.cdpService.listSegments(tenantId);
  }

  @Post('segments')
  @ApiOperation({ summary: 'Create new segment (SQL or visual builder)' })
  async createSegment(@Body() segmentDto: SegmentCreateDto) {
    return this.cdpService.createSegment(segmentDto);
  }

  @Get('segments/:segmentId/users')
  @ApiOperation({ summary: 'Get users in a segment' })
  async getSegmentUsers(
    @Param('segmentId') segmentId: string,
    @Query('limit') limit: number = 100,
    @Query('offset') offset: number = 0,
  ) {
    return this.cdpService.getSegmentUsers(segmentId, limit, offset);
  }

  @Post('segments/:segmentId/evaluate')
  @ApiOperation({ summary: 'Evaluate segment membership' })
  async evaluateSegment(@Param('segmentId') segmentId: string) {
    return this.cdpService.evaluateSegment(segmentId);
  }

  @Post('users/:userId/consent')
  @ApiOperation({ summary: 'Update user consent preferences' })
  async updateConsent(
    @Param('userId') userId: string,
    @Body() consentDto: ConsentUpdateDto,
  ) {
    return this.cdpService.updateConsent(userId, consentDto);
  }

  @Get('users/:userId/consent')
  @ApiOperation({ summary: 'Get user consent preferences' })
  async getConsent(@Param('userId') userId: string) {
    return this.cdpService.getConsent(userId);
  }

  @Post('segments/:segmentId/activate')
  @ApiOperation({ summary: 'Activate segment for external integrations' })
  async activateSegment(
    @Param('segmentId') segmentId: string,
    @Body('integrations') integrations: string[],
  ) {
    return this.cdpService.activateSegment(segmentId, integrations);
  }

  @Get('events/anonymous/:anonymousId/resolve')
  @ApiOperation({ summary: 'Resolve anonymous user to known identity' })
  async resolveAnonymousIdentity(@Param('anonymousId') anonymousId: string) {
    return this.cdpService.resolveAnonymousIdentity(anonymousId);
  }
}
