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
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AmmBotService } from './amm-bot.service';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { CreateRiskParameterDto } from './dto/create-risk-parameter.dto';
import { UpdateRiskParameterDto } from './dto/update-risk-parameter.dto';

@ApiTags('amm-bot')
@Controller('amm-bot')
export class AmmBotController {
  constructor(private readonly ammBotService: AmmBotService) {}

  @Post('strategies')
  @ApiOperation({ summary: 'Create a new AMM bot strategy' })
  @ApiResponse({ status: 201, description: 'Strategy created successfully' })
  async createStrategy(@Request() req, @Body() createStrategyDto: CreateStrategyDto) {
    return this.ammBotService.createStrategy(req.user.id, createStrategyDto);
  }

  @Get('strategies')
  @ApiOperation({ summary: 'Get all user strategies' })
  @ApiResponse({ status: 200, description: 'Strategies retrieved successfully' })
  async getUserStrategies(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ammBotService.getUserStrategies(req.user.id, page, limit);
  }

  @Get('strategies/:id')
  @ApiOperation({ summary: 'Get a specific strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Strategy retrieved successfully' })
  async getStrategy(@Request() req, @Param('id') id: string) {
    return this.ammBotService.getStrategy(req.user.id, id);
  }

  @Put('strategies/:id')
  @ApiOperation({ summary: 'Update a strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Strategy updated successfully' })
  async updateStrategy(
    @Request() req,
    @Param('id') id: string,
    @Body() updateStrategyDto: UpdateStrategyDto,
  ) {
    return this.ammBotService.updateStrategy(req.user.id, id, updateStrategyDto);
  }

  @Post('strategies/:id/pause')
  @ApiOperation({ summary: 'Pause a strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Strategy paused successfully' })
  async pauseStrategy(@Request() req, @Param('id') id: string) {
    return this.ammBotService.pauseStrategy(req.user.id, id);
  }

  @Post('strategies/:id/resume')
  @ApiOperation({ summary: 'Resume a strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Strategy resumed successfully' })
  async resumeStrategy(@Request() req, @Param('id') id: string) {
    return this.ammBotService.resumeStrategy(req.user.id, id);
  }

  @Post('strategies/:id/stop')
  @ApiOperation({ summary: 'Stop a strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Strategy stopped successfully' })
  async stopStrategy(@Request() req, @Param('id') id: string) {
    return this.ammBotService.stopStrategy(req.user.id, id);
  }

  @Delete('strategies/:id')
  @ApiOperation({ summary: 'Delete a strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Strategy deleted successfully' })
  async deleteStrategy(@Request() req, @Param('id') id: string) {
    return this.ammBotService.deleteStrategy(req.user.id, id);
  }

  @Post('strategies/:id/deploy')
  @ApiOperation({ summary: 'Deploy strategy to DEXes' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Strategy deployed successfully' })
  async deployStrategy(
    @Request() req,
    @Param('id') id: string,
    @Body() deploymentData: Array<{
      dexName: string;
      amountA: string;
      amountB: string;
    }>,
  ) {
    return this.ammBotService.deployStrategy(req.user.id, id, deploymentData);
  }

  @Post('strategies/:id/rebalance')
  @ApiOperation({ summary: 'Manually rebalance a strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Strategy rebalanced successfully' })
  async rebalanceStrategy(@Request() req, @Param('id') id: string) {
    return this.ammBotService.rebalanceStrategy(req.user.id, id);
  }

  @Get('strategies/:id/performance')
  @ApiOperation({ summary: 'Get strategy performance dashboard' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Performance data retrieved successfully' })
  async getPerformanceDashboard(@Request() req, @Param('id') id: string) {
    return this.ammBotService.getPerformanceDashboard(req.user.id, id);
  }

  @Get('strategies/:id/impermanent-loss')
  @ApiOperation({ summary: 'Get impermanent loss analysis' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'IL analysis retrieved successfully' })
  async getImpermanentLossAnalysis(@Request() req, @Param('id') id: string) {
    return this.ammBotService.getImpermanentLossAnalysis(req.user.id, id);
  }

  @Get('strategies/:id/rebalance-history')
  @ApiOperation({ summary: 'Get rebalance history' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Rebalance history retrieved successfully' })
  async getRebalanceHistory(
    @Request() req,
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    return this.ammBotService.getRebalanceHistory(req.user.id, id, limit);
  }

  @Get('strategies/:id/next-rebalance')
  @ApiOperation({ summary: 'Get next rebalance estimate' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Next rebalance estimate retrieved successfully' })
  async getNextRebalanceEstimate(@Request() req, @Param('id') id: string) {
    return this.ammBotService.getNextRebalanceEstimate(req.user.id, id);
  }

  // Risk Management Endpoints
  @Post('strategies/:id/risk-parameters')
  @ApiOperation({ summary: 'Create risk parameter for strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 201, description: 'Risk parameter created successfully' })
  async createRiskParameter(
    @Request() req,
    @Param('id') id: string,
    @Body() createRiskDto: CreateRiskParameterDto,
  ) {
    return this.ammBotService.createRiskParameter(req.user.id, id, createRiskDto);
  }

  @Get('strategies/:id/risk-parameters')
  @ApiOperation({ summary: 'Get risk parameters for strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Risk parameters retrieved successfully' })
  async getRiskParameters(@Request() req, @Param('id') id: string) {
    return this.ammBotService.getRiskParameters(req.user.id, id);
  }

  @Put('risk-parameters/:riskId')
  @ApiOperation({ summary: 'Update risk parameter' })
  @ApiParam({ name: 'riskId', description: 'Risk parameter ID' })
  @ApiResponse({ status: 200, description: 'Risk parameter updated successfully' })
  async updateRiskParameter(
    @Request() req,
    @Param('riskId') riskId: string,
    @Body() updateRiskDto: UpdateRiskParameterDto,
  ) {
    return this.ammBotService.updateRiskParameter(req.user.id, riskId, updateRiskDto);
  }

  @Delete('risk-parameters/:riskId')
  @ApiOperation({ summary: 'Delete risk parameter' })
  @ApiParam({ name: 'riskId', description: 'Risk parameter ID' })
  @ApiResponse({ status: 200, description: 'Risk parameter deleted successfully' })
  async deleteRiskParameter(@Request() req, @Param('riskId') riskId: string) {
    return this.ammBotService.deleteRiskParameter(req.user.id, riskId);
  }

  @Post('risk-parameters/:riskId/reset')
  @ApiOperation({ summary: 'Reset triggered risk parameter' })
  @ApiParam({ name: 'riskId', description: 'Risk parameter ID' })
  @ApiResponse({ status: 200, description: 'Risk parameter reset successfully' })
  async resetRiskParameter(@Request() req, @Param('riskId') riskId: string) {
    return this.ammBotService.resetRiskParameter(req.user.id, riskId);
  }

  @Get('strategies/:id/risk-history')
  @ApiOperation({ summary: 'Get risk history for strategy' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiResponse({ status: 200, description: 'Risk history retrieved successfully' })
  async getRiskHistory(@Request() req, @Param('id') id: string) {
    return this.ammBotService.getRiskHistory(req.user.id, id);
  }

  // Position Management Endpoints
  @Get('positions/:id')
  @ApiOperation({ summary: 'Get position details' })
  @ApiParam({ name: 'id', description: 'Position ID' })
  @ApiResponse({ status: 200, description: 'Position details retrieved successfully' })
  async getPosition(@Request() req, @Param('id') id: string) {
    return this.ammBotService.getPosition(req.user.id, id);
  }

  @Post('positions/:id/collect-fees')
  @ApiOperation({ summary: 'Collect fees from position' })
  @ApiParam({ name: 'id', description: 'Position ID' })
  @ApiResponse({ status: 200, description: 'Fees collected successfully' })
  async collectFees(@Request() req, @Param('id') id: string) {
    return this.ammBotService.collectFees(req.user.id, id);
  }

  @Post('positions/:id/withdraw')
  @ApiOperation({ summary: 'Withdraw from position' })
  @ApiParam({ name: 'id', description: 'Position ID' })
  @ApiResponse({ status: 200, description: 'Withdrawal successful' })
  async withdrawFromPosition(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { percentage?: number },
  ) {
    return this.ammBotService.withdrawFromPosition(req.user.id, id, body.percentage);
  }

  // DEX Integration Endpoints
  @Get('dexes')
  @ApiOperation({ summary: 'Get supported DEXes' })
  @ApiResponse({ status: 200, description: 'Supported DEXes retrieved successfully' })
  async getSupportedDexes() {
    return this.ammBotService.getSupportedDexes();
  }

  @Get('dexes/:dexName/status')
  @ApiOperation({ summary: 'Get DEX status' })
  @ApiParam({ name: 'dexName', description: 'DEX name' })
  @ApiResponse({ status: 200, description: 'DEX status retrieved successfully' })
  async getDexStatus(@Param('dexName') dexName: string) {
    return this.ammBotService.getDexStatus(dexName);
  }

  // Analytics Endpoints
  @Post('strategies/compare')
  @ApiOperation({ summary: 'Compare multiple strategies' })
  @ApiResponse({ status: 200, description: 'Strategies compared successfully' })
  async compareStrategies(
    @Request() req,
    @Body() body: {
      strategyIds: string[];
      metricType: string;
      timeframe: string;
    },
  ) {
    return this.ammBotService.compareStrategies(req.user.id, body.strategyIds, body.metricType, body.timeframe);
  }

  @Get('strategies/:id/metrics/:metricType')
  @ApiOperation({ summary: 'Get specific metric history' })
  @ApiParam({ name: 'id', description: 'Strategy ID' })
  @ApiParam({ name: 'metricType', description: 'Metric type' })
  @ApiResponse({ status: 200, description: 'Metric history retrieved successfully' })
  async getMetricHistory(
    @Request() req,
    @Param('id') id: string,
    @Param('metricType') metricType: string,
    @Query('timeframe') timeframe?: string,
    @Query('limit') limit?: number,
  ) {
    return this.ammBotService.getMetricHistory(req.user.id, id, metricType, timeframe, limit);
  }
}
