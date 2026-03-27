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
import { TradeReportingService } from '../services/trade-reporting.service';
import { 
  CreateTradeReportDto, 
  ReportQueryDto 
} from '../dto';
import { Role } from '@prisma/client';

@ApiTags('trade-reporting')
@Controller('trade-reporting')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TradeReportingController {
  constructor(
    private readonly tradeReportingService: TradeReportingService,
  ) {}

  @Post('reports')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a new trade report' })
  @ApiResponse({ status: 201, description: 'Trade report created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createTradeReport(@Body() createTradeReportDto: CreateTradeReportDto) {
    return this.tradeReportingService.createTradeReport(createTradeReportDto);
  }

  @Post('reports/:reportId/generate-finra')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Generate FINRA format report' })
  @ApiParam({ name: 'reportId', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'FINRA report generated successfully' })
  async generateFINRAReport(@Param('reportId') reportId: string) {
    return this.tradeReportingService.generateFINRAReport(reportId);
  }

  @Post('reports/:reportId/process-large')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Process large trade report' })
  @ApiParam({ name: 'reportId', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Large report processing started' })
  @HttpCode(HttpStatus.OK)
  async processLargeTradeReport(@Param('reportId') reportId: string) {
    return this.tradeReportingService.processLargeTradeReport(reportId);
  }

  @Post('reports/:reportId/submit-to-finra')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Submit report to FINRA' })
  @ApiParam({ name: 'reportId', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report submitted to FINRA successfully' })
  async submitToFINRA(@Param('reportId') reportId: string) {
    return this.tradeReportingService.submitToFINRA(reportId);
  }

  @Get('reports/date-range')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get trade reports by date range' })
  @ApiQuery({ name: 'startDate', description: 'Start date' })
  @ApiQuery({ name: 'endDate', description: 'End date' })
  @ApiResponse({ status: 200, description: 'Trade reports retrieved successfully' })
  async getTradeReportsByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.tradeReportingService.getTradeReportsByDateRange(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('reports/symbol/:symbol')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get trade reports by symbol' })
  @ApiParam({ name: 'symbol', description: 'Trading symbol' })
  @ApiResponse({ status: 200, description: 'Trade reports retrieved successfully' })
  async getTradeReportsBySymbol(@Param('symbol') symbol: string) {
    return this.tradeReportingService.getTradeReportsBySymbol(symbol);
  }

  @Get('reports/address/:address')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get trade reports by address' })
  @ApiParam({ name: 'address', description: 'Wallet address' })
  @ApiResponse({ status: 200, description: 'Trade reports retrieved successfully' })
  async getTradeReportsByAddress(@Param('address') address: string) {
    return this.tradeReportingService.getTradeReportsByAddress(address);
  }
}
