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
import { ComplianceService } from '../services/compliance.service';
import { 
  CreateComplianceReportDto,
  QuarterlyComplianceDto 
} from '../dto';
import { Role, ComplianceCertificationType } from '@prisma/client';

@ApiTags('compliance')
@Controller('compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplianceController {
  constructor(
    private readonly complianceService: ComplianceService,
  ) {}

  @Post('reports')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a new compliance report' })
  @ApiResponse({ status: 201, description: 'Compliance report created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createComplianceReport(@Body() createComplianceReportDto: CreateComplianceReportDto) {
    return this.complianceService.createComplianceReport(createComplianceReportDto);
  }

  @Post('quarterly/:quarter/:year')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Generate quarterly compliance report' })
  @ApiParam({ name: 'quarter', description: 'Quarter (Q1, Q2, Q3, Q4)' })
  @ApiParam({ name: 'year', description: 'Year' })
  @ApiResponse({ status: 200, description: 'Quarterly compliance report generated successfully' })
  async generateQuarterlyComplianceReport(
    @Param('quarter') quarter: string,
    @Param('year') year: string,
  ) {
    return this.complianceService.generateQuarterlyComplianceReport(quarter, parseInt(year));
  }

  @Post('quarterly/submit')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Submit quarterly compliance certification' })
  @ApiResponse({ status: 201, description: 'Quarterly certification submitted successfully' })
  async submitQuarterlyCertification(
    @Body() submissionData: {
      quarterlyReport: QuarterlyComplianceDto;
      certifiedBy: string;
    },
  ) {
    return this.complianceService.submitQuarterlyCertification(
      submissionData.quarterlyReport,
      submissionData.certifiedBy,
    );
  }

  @Post('schedule-certifications')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Schedule quarterly compliance certifications' })
  @ApiResponse({ status: 200, description: 'Certifications scheduled successfully' })
  @HttpCode(HttpStatus.OK)
  async scheduleQuarterlyCertifications() {
    return this.complianceService.scheduleQuarterlyCertifications();
  }

  @Put('items/:itemId/approve')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Approve compliance item' })
  @ApiParam({ name: 'itemId', description: 'Compliance item ID' })
  @ApiResponse({ status: 200, description: 'Compliance item approved successfully' })
  @HttpCode(HttpStatus.OK)
  async approveComplianceItem(
    @Param('itemId') itemId: string,
    @Body() approvalData: { approvedBy: string },
  ) {
    return this.complianceService.approveComplianceItem(itemId, approvalData.approvedBy);
  }

  @Get('reports/type/:certificationType')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get compliance reports by type' })
  @ApiParam({ name: 'certificationType', description: 'Certification type' })
  @ApiResponse({ status: 200, description: 'Compliance reports retrieved successfully' })
  async getComplianceReportsByType(@Param('certificationType') certificationType: ComplianceCertificationType) {
    return this.complianceService.getComplianceReportsByType(certificationType);
  }

  @Get('reports/period')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get compliance reports by period' })
  @ApiQuery({ name: 'startDate', description: 'Start date' })
  @ApiQuery({ name: 'endDate', description: 'End date' })
  @ApiResponse({ status: 200, description: 'Compliance reports retrieved successfully' })
  async getComplianceReportsByPeriod(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.complianceService.getComplianceReportsByPeriod(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('statistics')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get compliance statistics' })
  @ApiResponse({ status: 200, description: 'Compliance statistics retrieved successfully' })
  async getComplianceStatistics() {
    return this.complianceService.getComplianceStatistics();
  }

  @Get('quarterly/:quarter/:year')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get quarterly compliance report' })
  @ApiParam({ name: 'quarter', description: 'Quarter (Q1, Q2, Q3, Q4)' })
  @ApiParam({ name: 'year', description: 'Year' })
  @ApiResponse({ status: 200, description: 'Quarterly compliance report retrieved successfully' })
  async getQuarterlyComplianceReport(
    @Param('quarter') quarter: string,
    @Param('year') year: string,
  ) {
    return this.complianceService.generateQuarterlyComplianceReport(quarter, parseInt(year));
  }
}
