import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BotStrategy, StrategyStatus } from '../entities/bot-strategy.entity';
import { BotPosition, PositionStatus } from '../entities/bot-position.entity';
import { DexIntegrationService } from './dex-integration.service';
import { ImpermanentLossService } from './impermanent-loss.service';
import { RiskManagementService } from './risk-management.service';

@Injectable()
export class RebalanceService {
  private readonly logger = new Logger(RebalanceService.name);

  constructor(
    @InjectRepository(BotStrategy)
    private strategyRepository: Repository<BotStrategy>,
    @InjectRepository(BotPosition)
    private positionRepository: Repository<BotPosition>,
    private dexIntegrationService: DexIntegrationService,
    private impermanentLossService: ImpermanentLossService,
    private riskManagementService: RiskManagementService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkRebalanceTriggers(): Promise<void> {
    this.logger.log('Checking rebalance triggers for all active strategies');

    const activeStrategies = await this.strategyRepository.find({
      where: { status: StrategyStatus.ACTIVE },
      relations: ['positions', 'riskParameters'],
    });

    for (const strategy of activeStrategies) {
      try {
        await this.evaluateRebalanceNeeds(strategy);
      } catch (error) {
        this.logger.error(`Error evaluating rebalance for strategy ${strategy.id}: ${error.message}`);
      }
    }
  }

  async manualRebalance(userId: string, strategyId: string): Promise<{
    success: boolean;
    rebalancedPositions: string[];
    reason: string;
  }> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId, userId },
      relations: ['positions'],
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    if (strategy.status !== StrategyStatus.ACTIVE) {
      throw new Error(`Strategy ${strategyId} is not active`);
    }

    const rebalancedPositions = [];
    const reasons = [];

    // Check all rebalance triggers
    const triggers = await this.evaluateAllTriggers(strategy);

    for (const trigger of triggers) {
      if (trigger.shouldRebalance) {
        try {
          await this.executeRebalance(strategy, trigger.positions, trigger.reason);
          rebalancedPositions.push(...trigger.positions.map(p => p.id));
          reasons.push(trigger.reason);
        } catch (error) {
          this.logger.error(`Manual rebalance failed for position: ${error.message}`);
        }
      }
    }

    return {
      success: rebalancedPositions.length > 0,
      rebalancedPositions,
      reason: reasons.join('; '),
    };
  }

  async autoRebalancePosition(positionId: string): Promise<{
    success: boolean;
    newAmountA: string;
    newAmountB: string;
    reason: string;
  }> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
      relations: ['strategy'],
    });

    if (!position) {
      throw new NotFoundException(`Position ${positionId} not found`);
    }

    const strategy = position.strategy;
    if (strategy.status !== StrategyStatus.ACTIVE) {
      throw new Error(`Strategy is not active for auto-rebalancing`);
    }

    // Determine rebalance reason and calculate new amounts
    const rebalanceResult = await this.calculateRebalanceAmounts(position);

    if (!rebalanceResult.shouldRebalance) {
      return {
        success: false,
        newAmountA: position.amountA,
        newAmountB: position.amountB,
        reason: 'No rebalance needed',
      };
    }

    // Execute rebalance
    await this.dexIntegrationService.rebalancePosition(
      positionId,
      rebalanceResult.newAmountA,
      rebalanceResult.newAmountB,
    );

    // Update position
    position.lastRebalanceAt = new Date();
    await this.positionRepository.save(position);

    // Update strategy
    strategy.lastRebalanceAt = new Date();
    await this.strategyRepository.save(strategy);

    this.logger.log(`Auto-rebalanced position ${positionId}: ${rebalanceResult.reason}`);

    return {
      success: true,
      newAmountA: rebalanceResult.newAmountA,
      newAmountB: rebalanceResult.newAmountB,
      reason: rebalanceResult.reason,
    };
  }

  async getRebalanceHistory(strategyId: string, limit: number = 50): Promise<Array<{
    timestamp: Date;
    positionId: string;
    reason: string;
    oldAmounts: { amountA: string; amountB: string };
    newAmounts: { amountA: string; amountB: string };
  }>> {
    // This would typically be stored in a separate rebalance history table
    // For now, return mock data
    const history = [];
    const now = new Date();

    for (let i = 0; i < Math.min(limit, 20); i++) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      history.push({
        timestamp,
        positionId: `mock-position-${i}`,
        reason: ['Price deviation', 'Impermanent loss threshold', 'Risk limit triggered'][i % 3],
        oldAmounts: {
          amountA: (1000 + Math.random() * 500).toString(),
          amountB: (1000 + Math.random() * 500).toString(),
        },
        newAmounts: {
          amountA: (1000 + Math.random() * 500).toString(),
          amountB: (1000 + Math.random() * 500).toString(),
        },
      });
    }

    return history;
  }

  async getNextRebalanceEstimate(strategyId: string): Promise<{
    estimatedTime: Date;
    triggers: Array<{
      type: string;
      probability: number;
      estimatedTime: Date;
    }>;
  }> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    const triggers = [];
    const now = new Date();

    // Time-based trigger
    if (strategy.configuration.rebalanceTriggers?.timeInterval) {
      const timeInterval = strategy.configuration.rebalanceTriggers.timeInterval;
      const lastRebalance = strategy.lastRebalanceAt || strategy.createdAt;
      const nextTimeRebalance = new Date(lastRebalance.getTime() + timeInterval * 60 * 1000);

      triggers.push({
        type: 'time_interval',
        probability: 1.0,
        estimatedTime: nextTimeRebalance,
      });
    }

    // Price deviation trigger (probabilistic estimate)
    if (strategy.configuration.rebalanceTriggers?.priceDeviation) {
      const estimatedPriceTrigger = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours estimate
      triggers.push({
        type: 'price_deviation',
        probability: 0.7,
        estimatedTime: estimatedPriceTrigger,
      });
    }

    // IL threshold trigger (probabilistic estimate)
    if (strategy.configuration.rebalanceTriggers?.impermanentLossThreshold) {
      const estimatedILTrigger = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours estimate
      triggers.push({
        type: 'impermanent_loss',
        probability: 0.5,
        estimatedTime: estimatedILTrigger,
      });
    }

    // Find earliest estimated trigger
    const nextRebalance = triggers.length > 0
      ? new Date(Math.min(...triggers.map(t => t.estimatedTime.getTime())))
      : new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours default

    return {
      estimatedTime: nextRebalance,
      triggers,
    };
  }

  private async evaluateRebalanceNeeds(strategy: BotStrategy): Promise<void> {
    const triggers = await this.evaluateAllTriggers(strategy);

    for (const trigger of triggers) {
      if (trigger.shouldRebalance) {
        try {
          await this.executeRebalance(strategy, trigger.positions, trigger.reason);
        } catch (error) {
          this.logger.error(`Auto-rebalance failed: ${error.message}`);
        }
      }
    }
  }

  private async evaluateAllTriggers(strategy: BotStrategy): Promise<Array<{
    shouldRebalance: boolean;
    positions: BotPosition[];
    reason: string;
  }>> {
    const triggers = [];

    // 1. Time-based trigger
    const timeTrigger = await this.evaluateTimeTrigger(strategy);
    triggers.push(timeTrigger);

    // 2. Price deviation trigger
    const priceTrigger = await this.evaluatePriceTrigger(strategy);
    triggers.push(priceTrigger);

    // 3. Impermanent loss trigger
    const ilTrigger = await this.evaluateILTrigger(strategy);
    triggers.push(ilTrigger);

    // 4. Risk parameter triggers
    const riskTrigger = await this.evaluateRiskTrigger(strategy);
    triggers.push(riskTrigger);

    return triggers;
  }

  private async evaluateTimeTrigger(strategy: BotStrategy): Promise<{
    shouldRebalance: boolean;
    positions: BotPosition[];
    reason: string;
  }> {
    const timeInterval = strategy.configuration.rebalanceTriggers?.timeInterval;
    if (!timeInterval) {
      return { shouldRebalance: false, positions: [], reason: 'No time interval configured' };
    }

    const lastRebalance = strategy.lastRebalanceAt || strategy.createdAt;
    const timeSinceRebalance = Date.now() - lastRebalance.getTime();
    const shouldRebalance = timeSinceRebalance >= timeInterval * 60 * 1000;

    return {
      shouldRebalance,
      positions: strategy.positions,
      reason: shouldRebalance ? 'Time-based rebalance triggered' : 'Time interval not reached',
    };
  }

  private async evaluatePriceTrigger(strategy: BotStrategy): Promise<{
    shouldRebalance: boolean;
    positions: BotPosition[];
    reason: string;
  }> {
    const priceDeviationThreshold = strategy.configuration.rebalanceTriggers?.priceDeviation;
    if (!priceDeviationThreshold) {
      return { shouldRebalance: false, positions: [], reason: 'No price deviation configured' };
    }

    const positionsToRebalance = [];
    
    for (const position of strategy.positions) {
      if (position.priceRange) {
        const currentPrice = parseFloat(position.priceRange.currentPrice);
        const lowerBound = parseFloat(position.priceRange.lowerBound);
        const upperBound = parseFloat(position.priceRange.upperBound);
        
        // Check if price is out of range
        if (currentPrice < lowerBound || currentPrice > upperBound) {
          positionsToRebalance.push(position);
        }
      }
    }

    const shouldRebalance = positionsToRebalance.length > 0;

    return {
      shouldRebalance,
      positions: positionsToRebalance,
      reason: shouldRebalance ? `Price out of range for ${positionsToRebalance.length} positions` : 'Prices within range',
    };
  }

  private async evaluateILTrigger(strategy: BotStrategy): Promise<{
    shouldRebalance: boolean;
    positions: BotPosition[];
    reason: string;
  }> {
    const ilThreshold = strategy.configuration.rebalanceTriggers?.impermanentLossThreshold;
    if (!ilThreshold) {
      return { shouldRebalance: false, positions: [], reason: 'No IL threshold configured' };
    }

    const ilAlerts = await this.impermanentLossService.getILThresholdAlerts(strategy.id);
    const positionsToRebalance = strategy.positions.filter(position =>
      ilAlerts.some(alert => alert.positionId === position.id)
    );

    const shouldRebalance = positionsToRebalance.length > 0;

    return {
      shouldRebalance,
      positions: positionsToRebalance,
      reason: shouldRebalance ? `IL threshold exceeded for ${positionsToRebalance.length} positions` : 'IL within threshold',
    };
  }

  private async evaluateRiskTrigger(strategy: BotStrategy): Promise<{
    shouldRebalance: boolean;
    positions: BotPosition[];
    reason: string;
  }> {
    const riskCheck = await this.riskManagementService.checkRiskLimits(strategy.id);
    const shouldRebalance = riskCheck.triggered.length > 0;

    return {
      shouldRebalance,
      positions: strategy.positions, // Rebalance all positions when risk limits are triggered
      reason: shouldRebalance ? `Risk limits triggered: ${riskCheck.triggered.map(r => r.riskType).join(', ')}` : 'All risk limits within bounds',
    };
  }

  private async executeRebalance(
    strategy: BotStrategy,
    positions: BotPosition[],
    reason: string,
  ): Promise<void> {
    for (const position of positions) {
      try {
        const rebalanceResult = await this.calculateRebalanceAmounts(position);
        
        if (rebalanceResult.shouldRebalance) {
          await this.dexIntegrationService.rebalancePosition(
            position.id,
            rebalanceResult.newAmountA,
            rebalanceResult.newAmountB,
          );

          // Update position
          position.lastRebalanceAt = new Date();
          await this.positionRepository.save(position);

          this.logger.log(`Rebalanced position ${position.id}: ${reason}`);
        }
      } catch (error) {
        this.logger.error(`Failed to rebalance position ${position.id}: ${error.message}`);
      }
    }

    // Update strategy
    strategy.lastRebalanceAt = new Date();
    strategy.nextRebalanceAt = await this.calculateNextRebalanceTime(strategy);
    await this.strategyRepository.save(strategy);
  }

  private async calculateRebalanceAmounts(position: BotPosition): Promise<{
    shouldRebalance: boolean;
    newAmountA: string;
    newAmountB: string;
    reason: string;
  }> {
    // Mock rebalance calculation - would implement actual logic based on strategy type
    const currentAmountA = parseFloat(position.amountA);
    const currentAmountB = parseFloat(position.amountB);
    
    // Simple 50/50 rebalance for constant product pools
    const totalValue = currentAmountA + currentAmountB;
    const newAmountA = (totalValue / 2).toString();
    const newAmountB = (totalValue / 2).toString();

    const shouldRebalance = Math.abs(currentAmountA - parseFloat(newAmountA)) > totalValue * 0.05; // 5% threshold

    return {
      shouldRebalance,
      newAmountA,
      newAmountB,
      reason: shouldRebalance ? 'Portfolio imbalance detected' : 'Portfolio balanced',
    };
  }

  private async calculateNextRebalanceTime(strategy: BotStrategy): Promise<Date> {
    const estimate = await this.getNextRebalanceEstimate(strategy.id);
    return estimate.estimatedTime;
  }
}
