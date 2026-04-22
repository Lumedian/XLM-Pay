import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StrategyService } from './services/strategy.service';
import { RiskManagementService } from './services/risk-management.service';
import { PerformanceTrackingService } from './services/performance-tracking.service';
import { DexIntegrationService } from './services/dex-integration.service';
import { ImpermanentLossService } from './services/impermanent-loss.service';
import { RebalanceService } from './services/rebalance.service';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { CreateRiskParameterDto } from './dto/create-risk-parameter.dto';
import { UpdateRiskParameterDto } from './dto/update-risk-parameter.dto';

@Injectable()
export class AmmBotService {
  private readonly logger = new Logger(AmmBotService.name);

  constructor(
    private strategyService: StrategyService,
    private riskManagementService: RiskManagementService,
    private performanceTrackingService: PerformanceTrackingService,
    private dexIntegrationService: DexIntegrationService,
    private impermanentLossService: ImpermanentLossService,
    private rebalanceService: RebalanceService,
  ) {}

  // Strategy Management
  async createStrategy(userId: string, createStrategyDto: CreateStrategyDto) {
    return this.strategyService.createStrategy(userId, createStrategyDto);
  }

  async updateStrategy(userId: string, strategyId: string, updateStrategyDto: UpdateStrategyDto) {
    return this.strategyService.updateStrategy(userId, strategyId, updateStrategyDto);
  }

  async getStrategy(userId: string, strategyId: string) {
    return this.strategyService.getStrategy(userId, strategyId);
  }

  async getUserStrategies(userId: string, page?: number, limit?: number) {
    return this.strategyService.getUserStrategies(userId, page, limit);
  }

  async pauseStrategy(userId: string, strategyId: string) {
    return this.strategyService.pauseStrategy(userId, strategyId);
  }

  async resumeStrategy(userId: string, strategyId: string) {
    return this.strategyService.resumeStrategy(userId, strategyId);
  }

  async stopStrategy(userId: string, strategyId: string) {
    return this.strategyService.stopStrategy(userId, strategyId);
  }

  async deleteStrategy(userId: string, strategyId: string) {
    return this.strategyService.deleteStrategy(userId, strategyId);
  }

  async deployStrategy(userId: string, strategyId: string, deploymentData: Array<{
    dexName: string;
    amountA: string;
    amountB: string;
  }>) {
    const strategy = await this.strategyService.getStrategy(userId, strategyId);
    return this.dexIntegrationService.deployToMultipleDexes(strategy, deploymentData);
  }

  async rebalanceStrategy(userId: string, strategyId: string) {
    return this.rebalanceService.manualRebalance(userId, strategyId);
  }

  // Performance Tracking
  async getPerformanceDashboard(userId: string, strategyId: string) {
    await this.strategyService.getStrategy(userId, strategyId); // Validate ownership
    return this.performanceTrackingService.getPerformanceDashboard(strategyId);
  }

  async getImpermanentLossAnalysis(userId: string, strategyId: string) {
    await this.strategyService.getStrategy(userId, strategyId); // Validate ownership
    return this.impermanentLossService.calculateStrategyIL(strategyId);
  }

  async getRebalanceHistory(userId: string, strategyId: string, limit?: number) {
    await this.strategyService.getStrategy(userId, strategyId); // Validate ownership
    return this.rebalanceService.getRebalanceHistory(strategyId, limit);
  }

  async getNextRebalanceEstimate(userId: string, strategyId: string) {
    await this.strategyService.getStrategy(userId, strategyId); // Validate ownership
    return this.rebalanceService.getNextRebalanceEstimate(strategyId);
  }

  // Risk Management
  async createRiskParameter(userId: string, strategyId: string, createRiskDto: CreateRiskParameterDto) {
    return this.riskManagementService.createRiskParameter(userId, strategyId, createRiskDto);
  }

  async getRiskParameters(userId: string, strategyId: string) {
    return this.riskManagementService.getRiskParameters(userId, strategyId);
  }

  async updateRiskParameter(userId: string, riskId: string, updateRiskDto: UpdateRiskParameterDto) {
    return this.riskManagementService.updateRiskParameter(userId, riskId, updateRiskDto);
  }

  async deleteRiskParameter(userId: string, riskId: string) {
    return this.riskManagementService.deleteRiskParameter(userId, riskId);
  }

  async resetRiskParameter(userId: string, riskId: string) {
    return this.riskManagementService.resetRiskParameter(userId, riskId);
  }

  async getRiskHistory(userId: string, strategyId: string) {
    return this.riskManagementService.getRiskHistory(userId, strategyId);
  }

  // Position Management
  async getPosition(userId: string, positionId: string) {
    const position = await this.dexIntegrationService.getPosition(userId, positionId);
    return position;
  }

  async collectFees(userId: string, positionId: string) {
    return this.dexIntegrationService.collectFees(positionId);
  }

  async withdrawFromPosition(userId: string, positionId: string, percentage?: number) {
    return this.dexIntegrationService.withdrawFromDex(userId, positionId, percentage);
  }

  // DEX Integration
  async getSupportedDexes() {
    return this.dexIntegrationService.getSupportedDexes();
  }

  async getDexStatus(dexName: string) {
    return this.dexIntegrationService.getDexStatus(dexName);
  }

  // Analytics
  async compareStrategies(userId: string, strategyIds: string[], metricType: string, timeframe: string) {
    // Validate ownership of all strategies
    for (const strategyId of strategyIds) {
      await this.strategyService.getStrategy(userId, strategyId);
    }

    return this.performanceTrackingService.compareStrategies(strategyIds, metricType as any, timeframe);
  }

  async getMetricHistory(userId: string, strategyId: string, metricType: string, timeframe?: string, limit?: number) {
    await this.strategyService.getStrategy(userId, strategyId); // Validate ownership
    return this.performanceTrackingService.getPerformanceHistory(strategyId, metricType as any, timeframe || '1d', limit);
  }
}
