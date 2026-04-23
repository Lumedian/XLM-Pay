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
  async createBot(@Body() createBotDto: CreateBotDto) {
    return this.ammBotService.createBot(createBotDto);
  }

  @Get()
  async getBots(@Query() query: QueryBotsDto) {
    return this.ammBotService.getBots(query);
  }

  @Get(':id')
  async getBot(@Param('id') id: string) {
    return this.ammBotService.getBot(id);
  }

  @Put(':id')
  async updateBot(@Param('id') id: string, @Body() updateBotDto: UpdateBotDto) {
    return this.ammBotService.updateBot(id, updateBotDto);
  }

  @Delete(':id')
  async deleteBot(@Param('id') id: string) {
    return this.ammBotService.deleteBot(id);
  }

  @Post(':id/start')
  async startBot(@Param('id') id: string) {
    return this.ammBotService.startBot(id);
  }

  @Post(':id/stop')
  async stopBot(@Param('id') id: string) {
    return this.ammBotService.stopBot(id);
  }

  @Post(':id/rebalance')
  async rebalanceBot(@Param('id') id: string, @Body() rebalanceDto?: RebalanceBotDto) {
    return this.ammBotService.rebalanceBot(id, rebalanceDto);
  }

  @Get(':id/performance')
  async getBotPerformance(@Param('id') id: string, @Query() query: PerformanceQueryDto) {
    return this.performanceAnalytics.calculatePerformanceComparison(id, query.days as any);
  }

  @Get(':id/dashboard')
  async getBotDashboard(@Param('id') id: string) {
    return this.dashboardService.getBotDashboardData(id);
  }

  @Get(':id/positions')
  async getBotPositions(@Param('id') id: string) {
    return this.ammBotService.getBotPositions(id);
  }

  @Get(':id/rebalance-history')
  async getRebalanceHistory(@Param('id') id: string, @Query('days') days?: number) {
    return this.ammBotService.getRebalanceHistory(id, days);
  }

  @Post('deploy')
  async deployStrategy(@Body() deploymentConfig: any) {
    return this.deploymentService.deployStrategy(deploymentConfig);
  }

  @Post('quick-deploy')
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
  async getDeploymentTemplates() {
    return this.deploymentService.getDeploymentTemplates();
  }

  @Get('dashboard')
  async getDashboard(@Query('userId') userId?: string) {
    return this.dashboardService.getDashboardData(userId);
  }

  @Get('analytics/performance')
  async getPerformanceAnalytics(@Query('period') period?: string) {
    return this.performanceAnalytics.generatePerformanceReport('all', period as any);
  }

  @Get('analytics/strategies')
  async compareStrategies(@Query('period') period?: string) {
    const bots = await this.ammBotService.getAllBots();
    return this.performanceAnalytics.compareStrategies(bots, period as any);
  }

  @Get('analytics/top-performers')
  async getTopPerformers(@Query('limit') limit?: number, @Query('period') period?: string) {
    const bots = await this.ammBotService.getAllBots();
    return this.performanceAnalytics.getTopPerformingBots(bots, period as any, limit);
  }

  @Get('risk/profiles')
  async getRiskProfiles() {
    return this.ammBotService.getRiskProfiles();
  }

  @Get('strategies')
  async getStrategies() {
    return this.ammBotService.getStrategies();
  }

  @Get('dex/supported')
  async getSupportedDexTypes() {
    return this.ammBotService.getSupportedDexTypes();
  }

  @Get('dex/compare/:token0/:token1')
  async compareDexes(@Param('token0') token0: string, @Param('token1') token1: string) {
    return this.ammBotService.compareDexes(token0, token1);
  }
}
