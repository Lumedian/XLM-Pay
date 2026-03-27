import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RegulatoryReportingService } from './regulatory-reporting.service';
import { 
  CreateReportDto, 
  UpdateReportStatusDto,
  ReportQueryDto,
  ReportStatisticsDto 
} from './dto';
import { Role } from '@prisma/client';

@ApiTags('regulatory-reporting')
@Controller('regulatory-reporting')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegulatoryReportingController {
  constructor(
    private readonly regulatoryReportingService: RegulatoryReportingService,
  ) {}

  @Post('reports')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a new regulatory report' })
  @ApiResponse({ status: 201, description: 'Report created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createReport(@Body() createReportDto: CreateReportDto) {
    return this.regulatoryReportingService.createReport(
      createReportDto.type,
      createReportDto.jurisdiction,
      createReportDto.reportPeriod,
      createReportDto.format,
    );
  }

  @Get('reports/:id')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get a specific regulatory report' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async getReport(@Param('id') id: string) {
    return this.regulatoryReportingService.getReport(id);
  }

  @Put('reports/:id/status')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update report status' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async updateReportStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateReportStatusDto,
  ) {
    return this.regulatoryReportingService.updateReportStatus(
      id,
      updateStatusDto.status,
      updateStatusDto.reason,
    );
  }

  @Get('reports')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get reports by type' })
  @ApiQuery({ name: 'type', required: false, description: 'Report type filter' })
  @ApiQuery({ name: 'status', required: false, description: 'Status filter' })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  async getReportsByType(@Query() query: ReportQueryDto) {
    return this.regulatoryReportingService.getReportsByType(
      query.type as any,
      query.status as any,
    );
  }

  @Get('reports/jurisdiction/:jurisdiction')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get reports by jurisdiction' })
  @ApiParam({ name: 'jurisdiction', description: 'Jurisdiction code' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date filter' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date filter' })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  async getReportsByJurisdiction(
    @Param('jurisdiction') jurisdiction: string,
    @Query() query: { startDate?: string; endDate?: string },
  ) {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    
    return this.regulatoryReportingService.getReportsByJurisdiction(
      jurisdiction,
      startDate,
      endDate,
    );
  }

  @Post('reports/:id/retry')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Retry a failed report' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report retry initiated' })
  @ApiResponse({ status: 400, description: 'Report cannot be retried' })
  @HttpCode(HttpStatus.OK)
  async retryFailedReport(@Param('id') id: string) {
    return this.regulatoryReportingService.retryFailedReport(id);
  }

  @Delete('reports/:id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Archive a report (soft delete)' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report archived successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @HttpCode(HttpStatus.OK)
  async deleteReport(@Param('id') id: string) {
    return this.regulatoryReportingService.deleteReport(id);
  }

  @Get('reports/:id/integrity')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Validate report integrity' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Integrity validation result' })
  async validateReportIntegrity(@Param('id') id: string) {
    const isValid = await this.regulatoryReportingService.validateReportIntegrity(id);
    return { valid: isValid };
  }

  @Get('statistics')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get regulatory reporting statistics' })
  @ApiQuery({ name: 'jurisdiction', required: false, description: 'Jurisdiction filter' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(@Query() query: ReportStatisticsDto) {
    return this.regulatoryReportingService.getReportStatistics(query.jurisdiction);
  }
}
