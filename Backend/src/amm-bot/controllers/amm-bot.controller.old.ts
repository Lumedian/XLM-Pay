import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { AmmBotService } from '../services/amm-bot.service';
import { DeploymentService } from '../services/deployment.service';
import { DashboardService } from '../analytics/dashboard.service';
import { PerformanceAnalyticsService } from '../analytics/performance-analytics.service';
import { CreateBotDto } from '../dto/create-bot.dto';
import { UpdateBotDto } from '../dto/update-bot.dto';
import { QueryBotsDto, PerformanceQueryDto } from '../dto/query-bots.dto';
import { RebalanceBotDto } from '../dto/update-bot.dto';
@Controller('amm-bots')
export class AmmBotController {
  constructor(
    private readonly ammBotService: AmmBotService,
    private readonly deploymentService: DeploymentService,
    private readonly dashboardService: DashboardService,
    private readonly performanceAnalytics: PerformanceAnalyticsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new AMM bot' })
  @ApiResponse({ status: 201, description: 'Bot created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createBot(@Body() createBotDto: CreateBotDto) {
    return this.ammBotService.createBot(createBotDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bots with optional filtering' })
  @ApiResponse({ status: 200, description: 'Bots retrieved successfully' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by bot status' })
  @ApiQuery({ name: 'strategyType', required: false, description: 'Filter by strategy type' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  async getBots(@Query() query: QueryBotsDto) {
    return this.ammBotService.getBots(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific bot by ID' })
  @ApiResponse({ status: 200, description: 'Bot retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  async getBot(@Param('id') id: string) {
    return this.ammBotService.getBot(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a bot configuration' })
  @ApiResponse({ status: 200, description: 'Bot updated successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  async updateBot(@Param('id') id: string, @Body() updateBotDto: UpdateBotDto) {
    return this.ammBotService.updateBot(id, updateBotDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a bot' })
  @ApiResponse({ status: 200, description: 'Bot deleted successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  async deleteBot(@Param('id') id: string) {
    return this.ammBotService.deleteBot(id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start a bot' })
  @ApiResponse({ status: 200, description: 'Bot started successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  async startBot(@Param('id') id: string) {
    return this.ammBotService.startBot(id);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop a bot' })
  @ApiResponse({ status: 200, description: 'Bot stopped successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  async stopBot(@Param('id') id: string) {
    return this.ammBotService.stopBot(id);
  }

  @Post(':id/rebalance')
  @ApiOperation({ summary: 'Manually trigger rebalancing for a bot' })
  @ApiResponse({ status: 200, description: 'Rebalancing triggered successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  async rebalanceBot(@Param('id') id: string, @Body() rebalanceDto?: RebalanceBotDto) {
    return this.ammBotService.rebalanceBot(id, rebalanceDto);
  }

  @Get(':id/performance')
  @ApiOperation({ summary: 'Get performance metrics for a bot' })
  @ApiResponse({ status: 200, description: 'Performance metrics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days for performance data' })
  @ApiQuery({ name: 'granularity', required: false, description: 'Data granularity (hourly/daily)' })
  async getBotPerformance(@Param('id') id: string, @Query() query: PerformanceQueryDto) {
    return this.performanceAnalytics.calculatePerformanceComparison(id, query.days as any);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Get dashboard data for a specific bot' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  async getBotDashboard(@Param('id') id: string) {
    return this.dashboardService.getBotDashboardData(id);
  }

  @Get(':id/positions')
  @ApiOperation({ summary: 'Get all positions for a bot' })
  @ApiResponse({ status: 200, description: 'Positions retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  async getBotPositions(@Param('id') id: string) {
    return this.ammBotService.getBotPositions(id);
  }

  @Get(':id/rebalance-history')
  @ApiOperation({ summary: 'Get rebalancing history for a bot' })
  @ApiResponse({ status: 200, description: 'Rebalancing history retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Bot not found' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days of history' })
  async getRebalanceHistory(@Param('id') id: string, @Query('days') days?: number) {
    return this.ammBotService.getRebalanceHistory(id, days);
  }

  @Post('deploy')
  @ApiOperation({ summary: 'Deploy a new strategy with one-click deployment' })
  @ApiResponse({ status: 201, description: 'Strategy deployed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid deployment configuration' })
  async deployStrategy(@Body() deploymentConfig: any) {
    return this.deploymentService.deployStrategy(deploymentConfig);
  }

  @Post('quick-deploy')
  @ApiOperation({ summary: 'Quick deploy with minimal configuration' })
  @ApiResponse({ status: 201, description: 'Strategy deployed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid configuration' })
  async quickDeploy(@Body() quickDeployConfig: any) {
    return this.deploymentService.quickDeploy(
      quickDeployConfig.userId,
      quickDeployConfig.strategyType,
      quickDeployConfig.riskProfile,
      quickDeployConfig.initialCapital,
      quickDeployConfig.tokenPair
    );
  }

  @Get('deployment/templates')
  @ApiOperation({ summary: 'Get available deployment templates' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  async getDeploymentTemplates() {
    return this.deploymentService.getDeploymentTemplates();
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get overall dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  async getDashboard(@Query('userId') userId?: string) {
    return this.dashboardService.getDashboardData(userId);
  }

  @Get('analytics/performance')
  @ApiOperation({ summary: 'Get performance analytics across all bots' })
  @ApiResponse({ status: 200, description: 'Performance analytics retrieved successfully' })
  @ApiQuery({ name: 'period', required: false, description: 'Analysis period' })
  async getPerformanceAnalytics(@Query('period') period?: string) {
    return this.performanceAnalytics.generatePerformanceReport('all', period as any);
  }

  @Get('analytics/strategies')
  @ApiOperation({ summary: 'Compare performance across different strategies' })
  @ApiResponse({ status: 200, description: 'Strategy comparison retrieved successfully' })
  @ApiQuery({ name: 'period', required: false, description: 'Analysis period' })
  async compareStrategies(@Query('period') period?: string) {
    const bots = await this.ammBotService.getAllBots();
    return this.performanceAnalytics.compareStrategies(bots, period as any);
  }

  @Get('analytics/top-performers')
  @ApiOperation({ summary: 'Get top performing bots' })
  @ApiResponse({ status: 200, description: 'Top performers retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of top performers to return' })
  @ApiQuery({ name: 'period', required: false, description: 'Analysis period' })
  async getTopPerformers(@Query('limit') limit?: number, @Query('period') period?: string) {
    const bots = await this.ammBotService.getAllBots();
    return this.performanceAnalytics.getTopPerformingBots(bots, period as any, limit);
  }

  @Get('risk/profiles')
  @ApiOperation({ summary: 'Get available risk profiles' })
  @ApiResponse({ status: 200, description: 'Risk profiles retrieved successfully' })
  async getRiskProfiles() {
    return this.ammBotService.getRiskProfiles();
  }

  @Get('strategies')
  @ApiOperation({ summary: 'Get available strategy types' })
  @ApiResponse({ status: 200, description: 'Strategy types retrieved successfully' })
  async getStrategies() {
    return this.ammBotService.getStrategies();
  }

  @Get('dex/supported')
  @ApiOperation({ summary: 'Get supported DEX types' })
  @ApiResponse({ status: 200, description: 'Supported DEX types retrieved successfully' })
  async getSupportedDexTypes() {
    return this.ammBotService.getSupportedDexTypes();
  }

  @Get('dex/compare/:token0/:token1')
  @ApiOperation({ summary: 'Compare DEXes for a token pair' })
  @ApiResponse({ status: 200, description: 'DEX comparison retrieved successfully' })
  @ApiParam({ name: 'token0', description: 'First token address' })
  @ApiParam({ name: 'token1', description: 'Second token address' })
  async compareDexes(@Param('token0') token0: string, @Param('token1') token1: string) {
    return this.ammBotService.compareDexes(token0, token1);
  }
}
