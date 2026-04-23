import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AmmBot, BotStatus, RebalanceSignal, LiquidityPosition, MarketData } from '../interfaces/amm-bot.interface';
import { BaseStrategy } from '../interfaces/strategy.interface';
import { DexFactory } from '../integrations/dex.factory';
import { StrategyFactory } from '../strategies/strategy.factory';
import { DexIntegration } from '../interfaces/dex-integration.interface';

@Injectable()
export class RebalancingService {
  private readonly logger = new Logger(RebalancingService.name);
  private activeBots: Map<string, AmmBot> = new Map();

  constructor(
    private readonly dexFactory: DexFactory,
    private readonly strategyFactory: StrategyFactory,
  ) {}

  registerBot(bot: AmmBot): void {
    this.activeBots.set(bot.id, bot);
    this.logger.log(`Registered bot ${bot.id} for rebalancing monitoring`);
  }

  unregisterBot(botId: string): void {
    this.activeBots.delete(botId);
    this.logger.log(`Unregistered bot ${botId} from rebalancing monitoring`);
  }

  @Cron('*/30 * * * * *') // Every 30 seconds
  async monitorAndRebalance(): Promise<void> {
    const activeBots = Array.from(this.activeBots.values()).filter(
      bot => bot.status === BotStatus.ACTIVE
    );

    if (activeBots.length === 0) {
      return;
    }

    this.logger.debug(`Monitoring ${activeBots.length} active bots for rebalancing opportunities`);

    const rebalancePromises = activeBots.map(bot => this.checkAndRebalanceBot(bot));
    await Promise.allSettled(rebalancePromises);
  }

  private async checkAndRebalanceBot(bot: AmmBot): Promise<void> {
    try {
      for (const position of bot.positions) {
        const shouldRebalance = await this.shouldRebalancePosition(position, bot);
        
        if (shouldRebalance) {
          const rebalanceSignal = await this.generateRebalanceSignal(position, bot);
          await this.executeRebalance(rebalanceSignal);
          this.logger.log(`Executed rebalance for bot ${bot.id}, position ${position.id}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error checking rebalance for bot ${bot.id}:`, error);
    }
  }

  private async shouldRebalancePosition(position: LiquidityPosition, bot: AmmBot): Promise<boolean> {
    try {
      // Get market data
      const marketData = await this.getMarketData(position.token0, position.token1);
      
      // Get strategy
      const strategy = this.strategyFactory.getStrategy(bot.strategy.type);
      
      // Check if strategy recommends rebalancing
      return await strategy.shouldRebalance(position, marketData);
    } catch (error) {
      this.logger.error(`Error checking rebalance condition for position ${position.id}:`, error);
      return false;
    }
  }

  private async generateRebalanceSignal(position: LiquidityPosition, bot: AmmBot): Promise<RebalanceSignal> {
    const marketData = await this.getMarketData(position.token0, position.token1);
    const strategy = this.strategyFactory.getStrategy(bot.strategy.type);
    const rebalanceAmounts = await strategy.calculateRebalanceAmounts(position, marketData);

    return {
      botId: bot.id,
      positionId: position.id,
      type: this.determineRebalanceType(rebalanceAmounts),
      amount0: rebalanceAmounts.amount0ToAdd || rebalanceAmounts.amount0ToRemove,
      amount1: rebalanceAmounts.amount1ToAdd || rebalanceAmounts.amount1ToRemove,
      newTickLower: rebalanceAmounts.newTickLower,
      newTickUpper: rebalanceAmounts.newTickUpper,
      timestamp: new Date(),
      reason: rebalanceAmounts.reason
    };
  }

  private determineRebalanceType(amounts: any): 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY' | 'ADJUST_RANGE' {
    if (amounts.newTickLower !== undefined || amounts.newTickUpper !== undefined) {
      return 'ADJUST_RANGE';
    }
    if (amounts.amount0ToAdd || amounts.amount1ToAdd) {
      return 'ADD_LIQUIDITY';
    }
    if (amounts.amount0ToRemove || amounts.amount1ToRemove) {
      return 'REMOVE_LIQUIDITY';
    }
    return 'ADJUST_RANGE';
  }

  private async executeRebalance(signal: RebalanceSignal): Promise<void> {
    try {
      const bot = this.activeBots.get(signal.botId);
      if (!bot) {
        throw new Error(`Bot ${signal.botId} not found`);
      }

      const position = bot.positions.find(p => p.id === signal.positionId);
      if (!position) {
        throw new Error(`Position ${signal.positionId} not found`);
      }

      const dexIntegration = this.dexFactory.getIntegration(position.dexType);

      switch (signal.type) {
        case 'ADD_LIQUIDITY':
          await this.executeAddLiquidity(dexIntegration, signal, position);
          break;
        case 'REMOVE_LIQUIDITY':
          await this.executeRemoveLiquidity(dexIntegration, signal, position);
          break;
        case 'ADJUST_RANGE':
          await this.executeAdjustRange(dexIntegration, signal, position);
          break;
      }

      // Update bot's last rebalance time
      bot.lastRebalanceAt = signal.timestamp;
      
    } catch (error) {
      this.logger.error(`Error executing rebalance for signal ${signal.botId}:`, error);
      throw error;
    }
  }

  private async executeAddLiquidity(
    dexIntegration: DexIntegration,
    signal: RebalanceSignal,
    position: LiquidityPosition
  ): Promise<void> {
    const result = await dexIntegration.addLiquidity({
      token0: position.token0,
      token1: position.token1,
      amount0: signal.amount0 || 0,
      amount1: signal.amount1 || 0,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      feeTier: position.feeTier
    });

    if (result.status !== 'SUCCESS') {
      throw new Error(`Add liquidity failed: ${result.error}`);
    }
  }

  private async executeRemoveLiquidity(
    dexIntegration: DexIntegration,
    signal: RebalanceSignal,
    position: LiquidityPosition
  ): Promise<void> {
    const result = await dexIntegration.removeLiquidity({
      positionId: position.id,
      liquidityAmount: signal.amount0 || signal.amount1
    });

    if (result.status !== 'SUCCESS') {
      throw new Error(`Remove liquidity failed: ${result.error}`);
    }
  }

  private async executeAdjustRange(
    dexIntegration: DexIntegration,
    signal: RebalanceSignal,
    position: LiquidityPosition
  ): Promise<void> {
    // First remove existing liquidity
    const removeResult = await dexIntegration.removeLiquidity({
      positionId: position.id
    });

    if (removeResult.status !== 'SUCCESS') {
      throw new Error(`Remove liquidity for range adjustment failed: ${removeResult.error}`);
    }

    // Then add new liquidity with adjusted range
    const addResult = await dexIntegration.addLiquidity({
      token0: position.token0,
      token1: position.token1,
      amount0: position.amount0,
      amount1: position.amount1,
      tickLower: signal.newTickLower,
      tickUpper: signal.newTickUpper,
      feeTier: position.feeTier
    });

    if (addResult.status !== 'SUCCESS') {
      throw new Error(`Add liquidity for range adjustment failed: ${addResult.error}`);
    }
  }

  private async getMarketData(token0: string, token1: string): Promise<MarketData> {
    // Get the best DEX for this pair
    const bestDex = await this.dexFactory.getBestDexForPair(token0, token1);
    const dexIntegration = this.dexFactory.getIntegration(bestDex.dex);
    
    const currentPrice = await dexIntegration.getCurrentPrice(token0, token1);
    const poolData = await dexIntegration.getPoolData(token0, token1);

    return {
      token0,
      token1,
      currentPrice,
      price24hChange: (Math.random() - 0.5) * 0.1, // Simulated price change
      volume24h: poolData.volume24h,
      liquidity: poolData.liquidity,
      timestamp: new Date()
    };
  }

  async manualRebalance(botId: string, positionId?: string): Promise<RebalanceSignal[]> {
    const bot = this.activeBots.get(botId);
    if (!bot) {
      throw new Error(`Bot ${botId} not found`);
    }

    const positionsToRebalance = positionId 
      ? bot.positions.filter(p => p.id === positionId)
      : bot.positions;

    const signals: RebalanceSignal[] = [];

    for (const position of positionsToRebalance) {
      try {
        const shouldRebalance = await this.shouldRebalancePosition(position, bot);
        if (shouldRebalance) {
          const signal = await this.generateRebalanceSignal(position, bot);
          signals.push(signal);
        }
      } catch (error) {
        this.logger.error(`Error in manual rebalance for position ${position.id}:`, error);
      }
    }

    return signals;
  }

  async getRebalanceHistory(botId: string, days: number = 7): Promise<RebalanceSignal[]> {
    // This would typically fetch from a database
    // For now, return empty array as placeholder
    return [];
  }

  getActiveBotCount(): number {
    return Array.from(this.activeBots.values()).filter(
      bot => bot.status === BotStatus.ACTIVE
    ).length;
  }

  getRebalancingStats(): {
    totalBots: number;
    activeBots: number;
    lastCheckTime: Date;
    averageRebalanceFrequency: number;
  } {
    const totalBots = this.activeBots.size;
    const activeBots = this.getActiveBotCount();
    
    return {
      totalBots,
      activeBots,
      lastCheckTime: new Date(),
      averageRebalanceFrequency: 0 // Would calculate from historical data
    };
  }
}
