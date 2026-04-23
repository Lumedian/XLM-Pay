import { Injectable } from '@nestjs/common';
import { AmmBot, BotStatus, StrategyType, DexType } from '../interfaces/amm-bot.interface';
import { CreateBotDto } from '../dto/create-bot.dto';
import { UpdateBotDto } from '../dto/update-bot.dto';
import { QueryBotsDto } from '../dto/query-bots.dto';
import { RebalanceBotDto } from '../dto/update-bot.dto';
import { RiskConfigService } from '../config/risk-config.service';
import { StrategyFactory } from '../strategies/strategy.factory';
import { DexFactory } from '../integrations/dex.factory';
import { RebalancingService } from './rebalancing.service';
import { DashboardService } from '../analytics/dashboard.service';

@Injectable()
export class AmmBotService {
  private bots: Map<string, AmmBot> = new Map();

  constructor(
    private readonly riskConfigService: RiskConfigService,
    private readonly strategyFactory: StrategyFactory,
    private readonly dexFactory: DexFactory,
    private readonly rebalancingService: RebalancingService,
    private readonly dashboardService: DashboardService,
  ) {}

  async createBot(createBotDto: CreateBotDto): Promise<AmmBot> {
    const botId = this.generateBotId();
    
    const bot: AmmBot = {
      id: botId,
      userId: 'default-user', // Would come from auth context in real implementation
      name: createBotDto.name,
      strategy: createBotDto.strategy,
      positions: [],
      status: BotStatus.STOPPED,
      performance: {
        totalValueLocked: 0,
        feeRevenue: 0,
        impermanentLoss: 0,
        netProfit: 0,
        apr: 0,
        volume24h: 0,
        lastUpdateTime: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.bots.set(botId, bot);
    this.dashboardService.registerBot(bot);
    
    return bot;
  }

  async getBots(query: QueryBotsDto): Promise<{
    bots: AmmBot[];
    total: number;
    page: number;
    limit: number;
  }> {
    let filteredBots = Array.from(this.bots.values());

    // Apply filters
    if (query.userId) {
      filteredBots = filteredBots.filter(bot => bot.userId === query.userId);
    }
    
    if (query.status) {
      filteredBots = filteredBots.filter(bot => bot.status === query.status);
    }
    
    if (query.strategyType) {
      filteredBots = filteredBots.filter(bot => bot.strategy.type === query.strategyType);
    }
    
    if (query.dexType) {
      filteredBots = filteredBots.filter(bot => 
        bot.positions.some(pos => pos.dexType === query.dexType)
      );
    }

    // Sort
    filteredBots.sort((a, b) => {
      const aValue = a[query.sortBy as keyof AmmBot] as any;
      const bValue = b[query.sortBy as keyof AmmBot] as any;
      
      if (query.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // Paginate
    const total = filteredBots.length;
    const startIndex = (query.page - 1) * query.limit;
    const endIndex = startIndex + query.limit;
    const paginatedBots = filteredBots.slice(startIndex, endIndex);

    return {
      bots: paginatedBots,
      total,
      page: query.page,
      limit: query.limit
    };
  }

  async getBot(id: string): Promise<AmmBot | null> {
    return this.bots.get(id) || null;
  }

  async updateBot(id: string, updateBotDto: UpdateBotDto): Promise<AmmBot | null> {
    const bot = this.bots.get(id);
    if (!bot) {
      return null;
    }

    // Update bot properties
    if (updateBotDto.name) {
      bot.name = updateBotDto.name;
    }
    
    if (updateBotDto.strategy) {
      bot.strategy = updateBotDto.strategy;
    }
    
    if (updateBotDto.status) {
      bot.status = updateBotDto.status;
    }

    bot.updatedAt = new Date();
    this.dashboardService.updateBot(bot);
    
    return bot;
  }

  async deleteBot(id: string): Promise<boolean> {
    const bot = this.bots.get(id);
    if (!bot) {
      return false;
    }

    // Stop bot if it's active
    if (bot.status === BotStatus.ACTIVE) {
      await this.stopBot(id);
    }

    this.bots.delete(id);
    return true;
  }

  async startBot(id: string): Promise<AmmBot | null> {
    const bot = this.bots.get(id);
    if (!bot) {
      return null;
    }

    if (bot.status === BotStatus.ACTIVE) {
      return bot; // Already active
    }

    bot.status = BotStatus.ACTIVE;
    bot.updatedAt = new Date();
    
    // Register for rebalancing
    this.rebalancingService.registerBot(bot);
    this.dashboardService.updateBot(bot);
    
    return bot;
  }

  async stopBot(id: string): Promise<AmmBot | null> {
    const bot = this.bots.get(id);
    if (!bot) {
      return null;
    }

    if (bot.status === BotStatus.STOPPED) {
      return bot; // Already stopped
    }

    bot.status = BotStatus.STOPPED;
    bot.updatedAt = new Date();
    
    // Unregister from rebalancing
    this.rebalancingService.unregisterBot(id);
    this.dashboardService.updateBot(bot);
    
    return bot;
  }

  async rebalanceBot(id: string, rebalanceDto?: RebalanceBotDto): Promise<{
    success: boolean;
    signals: any[];
    error?: string;
  }> {
    const bot = this.bots.get(id);
    if (!bot) {
      return { success: false, signals: [], error: 'Bot not found' };
    }

    try {
      const signals = await this.rebalancingService.manualRebalance(id);
      
      return {
        success: true,
        signals
      };
    } catch (error) {
      return {
        success: false,
        signals: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getBotPositions(id: string): Promise<any[] | null> {
    const bot = this.bots.get(id);
    if (!bot) {
      return null;
    }

    return bot.positions.map(position => ({
      ...position,
      currentValue: position.amount0 + (position.amount1 * 2000), // Simulated current value
      feeRevenue: Math.random() * 100,
      impermanentLoss: Math.random() * 50
    }));
  }

  async getRebalanceHistory(id: string, days: number = 7): Promise<any[]> {
    return this.rebalancingService.getRebalanceHistory(id, days);
  }

  async getAllBots(): Promise<AmmBot[]> {
    return Array.from(this.bots.values());
  }

  async getRiskProfiles() {
    return this.riskConfigService.getAllRiskProfiles();
  }

  async getStrategies() {
    return this.strategyFactory.getAllStrategies().map(strategy => ({
      type: strategy.type,
      name: strategy.name
    }));
  }

  async getSupportedDexTypes() {
    return this.dexFactory.getSupportedDexTypes();
  }

  async compareDexes(token0: string, token1: string) {
    return this.dexFactory.compareDexes(token0, token1);
  }

  private generateBotId(): string {
    return 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Performance tracking methods
  async updateBotPerformance(id: string, performance: Partial<{
    totalValueLocked: number;
    feeRevenue: number;
    impermanentLoss: number;
    netProfit: number;
    apr: number;
    volume24h: number;
    lastUpdateTime: Date;
  }>): Promise<boolean> {
    const bot = this.bots.get(id);
    if (!bot) {
      return false;
    }

    bot.performance = {
      ...bot.performance,
      ...performance,
      lastUpdateTime: new Date()
    };
    
    bot.updatedAt = new Date();
    this.dashboardService.updateBot(bot);
    
    return true;
  }

  async getBotPerformanceMetrics(id: string, period: '24h' | '7d' | '30d' = '7d'): Promise<{
    totalValueLocked: number;
    feeRevenue: number;
    impermanentLoss: number;
    netProfit: number;
    apr: number;
    sharpeRatio: number;
    maxDrawdown: number;
  } | null> {
    const bot = this.bots.get(id);
    if (!bot) {
      return null;
    }

    // In a real implementation, this would calculate based on historical data
    return {
      totalValueLocked: Number(bot.performance.totalValueLocked),
      feeRevenue: Number(bot.performance.feeRevenue),
      impermanentLoss: Number(bot.performance.impermanentLoss),
      netProfit: Number(bot.performance.netProfit),
      apr: bot.performance.apr,
      sharpeRatio: Math.random() * 2, // Simulated
      maxDrawdown: Math.random() * 20 // Simulated
    };
  }

  async getBotAlerts(id: string): Promise<Array<{
    type: 'WARNING' | 'ERROR' | 'INFO';
    message: string;
    timestamp: Date;
  }>> {
    const bot = this.bots.get(id);
    if (!bot) {
      return [];
    }

    // Generate some sample alerts based on bot status
    const alerts = [];
    
    if (bot.status === BotStatus.ERROR) {
      alerts.push({
        type: 'ERROR' as const,
        message: 'Bot is in error state',
        timestamp: new Date()
      });
    }

    if (bot.performance.impermanentLoss > bot.performance.feeRevenue) {
      alerts.push({
        type: 'WARNING' as const,
        message: 'Impermanent loss exceeds fee revenue',
        timestamp: new Date()
      });
    }

    return alerts;
  }
}
