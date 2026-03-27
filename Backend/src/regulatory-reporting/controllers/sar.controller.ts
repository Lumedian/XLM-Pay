import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Body, 
  Param, 
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { SARService } from '../services/sar.service';
import { 
  CreateSARDto,
  SuspiciousPatternDto 
} from '../dto';
import { Role, SARStatus, SARPriority } from '@prisma/client';

@ApiTags('sar')
@Controller('sar')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SARController {
  constructor(
    private readonly sarService: SARService,
  ) {}

  @Post('reports')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a new Suspicious Activity Report' })
  @ApiResponse({ status: 201, description: 'SAR created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createSAR(@Body() createSARDto: CreateSARDto) {
    return this.sarService.createSAR(createSARDto);
  }

  @Post('generate-from-pattern')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Generate SAR from detected pattern' })
  @ApiResponse({ status: 201, description: 'SAR generated from pattern successfully' })
  async generateSARFromPattern(@Body() pattern: SuspiciousPatternDto) {
    return this.sarService.generateSARFromPattern(pattern);
  }

  @Post('batch-generate')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Batch generate SARs from patterns' })
  @ApiResponse({ status: 201, description: 'Batch SAR generation completed' })
  async batchGenerateSARs(@Body() patterns: SuspiciousPatternDto[]) {
    return this.sarService.batchGenerateSARs(patterns);
  }

  @Post('reports/:sarId/submit')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Submit SAR to regulatory authorities' })
  @ApiParam({ name: 'sarId', description: 'SAR ID' })
  @ApiResponse({ status: 200, description: 'SAR submitted successfully' })
  @HttpCode(HttpStatus.OK)
  async submitSAR(@Param('sarId') sarId: string) {
    return this.sarService.submitSAR(sarId);
  }

  @Post('reports/:sarId/acknowledge')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Acknowledge SAR from regulatory authority' })
  @ApiParam({ name: 'sarId', description: 'SAR ID' })
  @ApiResponse({ status: 200, description: 'SAR acknowledged successfully' })
  @HttpCode(HttpStatus.OK)
  async acknowledgeSAR(
    @Param('sarId') sarId: string,
    @Body() acknowledgmentData: any,
  ) {
    return this.sarService.acknowledgeSAR(sarId, acknowledgmentData);
  }

  @Put('reports/:sarId/status')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update SAR status' })
  @ApiParam({ name: 'sarId', description: 'SAR ID' })
  @ApiResponse({ status: 200, description: 'SAR status updated successfully' })
  async updateSARStatus(
    @Param('sarId') sarId: string,
    @Body() updateData: { status: SARStatus; reason?: string },
  ) {
    return this.sarService.updateSARStatus(sarId, updateData.status, updateData.reason);
  }

  @Get('reports/status/:status')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get SARs by status' })
  @ApiParam({ name: 'status', description: 'SAR status' })
  @ApiResponse({ status: 200, description: 'SARs retrieved successfully' })
  async getSARsByStatus(@Param('status') status: SARStatus) {
    return this.sarService.getSARsByStatus(status);
  }

  @Get('reports/priority/:priority')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get SARs by priority' })
  @ApiParam({ name: 'priority', description: 'SAR priority' })
  @ApiResponse({ status: 200, description: 'SARs retrieved successfully' })
  async getSARsByPriority(@Param('priority') priority: SARPriority) {
    return this.sarService.getSARsByPriority(priority);
  }

  @Get('reports/date-range')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get SARs by date range' })
  @ApiQuery({ name: 'startDate', description: 'Start date' })
  @ApiQuery({ name: 'endDate', description: 'End date' })
  @ApiResponse({ status: 200, description: 'SARs retrieved successfully' })
  async getSARsByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.sarService.getSARsByDateRange(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('reports/address/:address')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get SARs by address' })
  @ApiParam({ name: 'address', description: 'Wallet address' })
  @ApiResponse({ status: 200, description: 'SARs retrieved successfully' })
  async getSARsByAddress(@Param('address') address: string) {
    return this.sarService.getSARsByAddress(address);
  }

  @Get('investigation/:investigationId/summary')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get SAR investigation summary' })
  @ApiParam({ name: 'investigationId', description: 'Investigation ID' })
  @ApiResponse({ status: 200, description: 'Investigation summary retrieved successfully' })
  async getSARInvestigationSummary(@Param('investigationId') investigationId: string) {
    return this.sarService.getSARInvestigationSummary(investigationId);
  }

  @Get('statistics')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get SAR statistics' })
  @ApiResponse({ status: 200, description: 'SAR statistics retrieved successfully' })
  async getSARStatistics() {
    return this.sarService.getSARStatistics();
  }
}
