import { Injectable } from '@nestjs/common';
import { AmmBot, PerformanceMetrics, BotStatus } from '../interfaces/amm-bot.interface';
import { PerformanceAnalyticsService } from './performance-analytics.service';
import { ImpermanentLossService } from './impermanent-loss.service';

export interface DashboardData {
  overview: {
    totalBots: number;
    activeBots: number;
    totalValueLocked: number;
    totalFeeRevenue: number;
    totalImpermanentLoss: number;
    netProfit: number;
    averageAPR: number;
  };
  bots: Array<{
    id: string;
    name: string;
    status: BotStatus;
    strategy: string;
    totalValueLocked: number;
    feeRevenue: number;
    impermanentLoss: number;
    netProfit: number;
    apr: number;
    lastUpdateTime: Date;
  }>;
  performance: {
    topPerformers: Array<{
      botId: string;
      name: string;
      netProfit: number;
      apr: number;
    }>;
    worstPerformers: Array<{
      botId: string;
      name: string;
      netProfit: number;
      apr: number;
    }>;
  };
  alerts: Array<{
    type: 'WARNING' | 'ERROR' | 'INFO';
    message: string;
    botId?: string;
    timestamp: Date;
  }>;
}

export interface BotDashboardData {
  bot: AmmBot;
  performance: {
    currentMetrics: PerformanceMetrics;
    historicalData: Array<{
      timestamp: Date;
      totalValueLocked: number;
      feeRevenue: number;
      impermanentLoss: number;
      netProfit: number;
    }>;
    comparisons: {
      vsYesterday: {
        profitChange: number;
        aprChange: number;
      };
      vsLastWeek: {
        profitChange: number;
        aprChange: number;
      };
    };
  };
  positions: Array<{
    id: string;
    token0: string;
    token1: string;
    amount0: number;
    amount1: number;
    currentValue: number;
    feeRevenue: number;
    impermanentLoss: number;
    dexType: string;
    status: string;
  }>;
  rebalancing: {
    lastRebalance: Date;
    totalRebalances: number;
    averageRebalanceInterval: number;
    nextScheduledRebalance?: Date;
  };
  alerts: Array<{
    type: 'WARNING' | 'ERROR' | 'INFO';
    message: string;
    timestamp: Date;
  }>;
}

@Injectable()
export class DashboardService {
  private activeBots: Map<string, AmmBot> = new Map();
  private alerts: Array<{
    type: 'WARNING' | 'ERROR' | 'INFO';
    message: string;
    botId?: string;
    timestamp: Date;
  }> = [];

  constructor(
    private readonly performanceAnalytics: PerformanceAnalyticsService,
    private readonly impermanentLossService: ImpermanentLossService,
  ) {}

  registerBot(bot: AmmBot): void {
    this.activeBots.set(bot.id, bot);
    this.checkBotAlerts(bot);
  }

  updateBot(bot: AmmBot): void {
    this.activeBots.set(bot.id, bot);
    this.checkBotAlerts(bot);
  }

  getDashboardData(userId?: string): DashboardData {
    const bots = userId 
      ? Array.from(this.activeBots.values()).filter(bot => bot.userId === userId)
      : Array.from(this.activeBots.values());

    const overview = this.calculateOverview(bots);
    const botData = bots.map(bot => this.formatBotForDashboard(bot));
    const performance = this.calculatePerformanceData(bots);
    const alerts = this.getRecentAlerts();

    return {
      overview,
      bots: botData,
      performance,
      alerts
    };
  }

  getBotDashboardData(botId: string): BotDashboardData | null {
    const bot = this.activeBots.get(botId);
    if (!bot) {
      return null;
    }

    const performance = this.calculateBotPerformance(bot);
    const positions = this.formatBotPositions(bot);
    const rebalancing = this.calculateRebalancingData(bot);
    const alerts = this.getBotAlerts(botId);

    return {
      bot,
      performance,
      positions,
      rebalancing,
      alerts
    };
  }

  private calculateOverview(bots: AmmBot[]) {
    const totalBots = bots.length;
    const activeBots = bots.filter(bot => bot.status === BotStatus.ACTIVE).length;
    const totalValueLocked = bots.reduce((sum, bot) => sum + bot.performance.totalValueLocked, 0);
    const totalFeeRevenue = bots.reduce((sum, bot) => sum + bot.performance.feeRevenue, 0);
    const totalImpermanentLoss = bots.reduce((sum, bot) => sum + bot.performance.impermanentLoss, 0);
    const netProfit = totalFeeRevenue - totalImpermanentLoss;
    const averageAPR = bots.length > 0 
      ? bots.reduce((sum, bot) => sum + bot.performance.apr, 0) / bots.length 
      : 0;

    return {
      totalBots,
      activeBots,
      totalValueLocked,
      totalFeeRevenue,
      totalImpermanentLoss,
      netProfit,
      averageAPR
    };
  }

  private formatBotForDashboard(bot: AmmBot) {
    return {
      id: bot.id,
      name: bot.name,
      status: bot.status,
      strategy: bot.strategy.type,
      totalValueLocked: bot.performance.totalValueLocked,
      feeRevenue: bot.performance.feeRevenue,
      impermanentLoss: bot.performance.impermanentLoss,
      netProfit: bot.performance.netProfit,
      apr: bot.performance.apr,
      lastUpdateTime: bot.performance.lastUpdateTime
    };
  }

  private calculatePerformanceData(bots: AmmBot[]) {
    const performances = bots.map(bot => ({
      botId: bot.id,
      name: bot.name,
      netProfit: bot.performance.netProfit,
      apr: bot.performance.apr
    }));

    const sortedByProfit = [...performances].sort((a, b) => b.netProfit - a.netProfit);
    const topPerformers = sortedByProfit.slice(0, 5);
    const worstPerformers = sortedByProfit.slice(-5).reverse();

    return {
      topPerformers,
      worstPerformers
    };
  }

  private calculateBotPerformance(bot: AmmBot) {
    const currentMetrics = bot.performance;
    
    // Generate historical data (would come from database in real implementation)
    const historicalData = this.generateHistoricalData(bot);
    
    // Calculate comparisons
    const comparisons = this.calculateComparisons(bot, historicalData);

    return {
      currentMetrics,
      historicalData,
      comparisons
    };
  }

  private generateHistoricalData(bot: AmmBot) {
    const data = [];
    const now = new Date();
    
    // Generate last 30 days of data
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
      const dayOffset = 29 - i;
      
      // Simulate historical data with some randomness
      const baseTVL = bot.performance.totalValueLocked;
      const baseFees = bot.performance.feeRevenue;
      const baseIL = bot.performance.impermanentLoss;
      
      data.push({
        timestamp: date,
        totalValueLocked: baseTVL * (0.9 + Math.random() * 0.2) * (1 - dayOffset * 0.01),
        feeRevenue: baseFees * (dayOffset / 30),
        impermanentLoss: baseIL * (dayOffset / 30) * (0.8 + Math.random() * 0.4),
        netProfit: (baseFees - baseIL) * (dayOffset / 30)
      });
    }
    
    return data;
  }

  private calculateComparisons(bot: AmmBot, historicalData: any[]) {
    if (historicalData.length < 7) {
      return {
        vsYesterday: { profitChange: 0, aprChange: 0 },
        vsLastWeek: { profitChange: 0, aprChange: 0 }
      };
    }

    const yesterday = historicalData[historicalData.length - 2];
    const lastWeek = historicalData[historicalData.length - 7];
    const current = bot.performance;

    const vsYesterday = {
      profitChange: yesterday.netProfit !== 0 
        ? ((current.netProfit - yesterday.netProfit) / Math.abs(yesterday.netProfit)) * 100
        : 0,
      aprChange: yesterday.apr !== 0
        ? ((current.apr - yesterday.apr) / Math.abs(yesterday.apr)) * 100
        : 0
    };

    const vsLastWeek = {
      profitChange: lastWeek.netProfit !== 0
        ? ((current.netProfit - lastWeek.netProfit) / Math.abs(lastWeek.netProfit)) * 100
        : 0,
      aprChange: lastWeek.apr !== 0
        ? ((current.apr - lastWeek.apr) / Math.abs(lastWeek.apr)) * 100
        : 0
    };

    return { vsYesterday, vsLastWeek };
  }

  private formatBotPositions(bot: AmmBot) {
    return bot.positions.map(position => {
      const currentValue = position.amount0 + (position.amount1 * 2000); // Assuming ETH price of 2000
      const feeRevenue = Math.random() * 100; // Simulated fee revenue
      const impermanentLoss = Math.random() * 50; // Simulated IL
      
      return {
        id: position.id,
        token0: position.token0,
        token1: position.token1,
        amount0: position.amount0,
        amount1: position.amount1,
        currentValue,
        feeRevenue,
        impermanentLoss,
        dexType: position.dexType,
        status: 'ACTIVE'
      };
    });
  }

  private calculateRebalancingData(bot: AmmBot) {
    const now = new Date();
    const lastRebalance = bot.lastRebalanceAt || bot.createdAt;
    const totalRebalances = Math.floor(Math.random() * 20) + 1; // Simulated
    const averageRebalanceInterval = (now.getTime() - bot.createdAt.getTime()) / (totalRebalances * 1000 * 60 * 60); // hours
    
    return {
      lastRebalance,
      totalRebalances,
      averageRebalanceInterval,
      nextScheduledRebalance: new Date(lastRebalance.getTime() + (24 * 60 * 60 * 1000)) // Next day
    };
  }

  private getRecentAlerts() {
    const cutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)); // Last 24 hours
    return this.alerts.filter(alert => alert.timestamp >= cutoff);
  }

  private getBotAlerts(botId: string) {
    return this.alerts.filter(alert => alert.botId === botId);
  }

  private checkBotAlerts(bot: AmmBot) {
    const alerts: Array<{
      type: 'WARNING' | 'ERROR' | 'INFO';
      message: string;
      botId?: string;
      timestamp: Date;
    }> = [];

    // Check for high impermanent loss
    if (bot.performance.impermanentLoss > bot.performance.feeRevenue * 1.5) {
      alerts.push({
        type: 'WARNING',
        message: `Impermanent loss (${bot.performance.impermanentLoss}) exceeds fee revenue (${bot.performance.feeRevenue})`,
        botId: bot.id,
        timestamp: new Date()
      });
    }

    // Check for low APR
    if (bot.performance.apr < 2) {
      alerts.push({
        type: 'WARNING',
        message: `Low APR detected: ${bot.performance.apr}%`,
        botId: bot.id,
        timestamp: new Date()
      });
    }

    // Check for bot errors
    if (bot.status === BotStatus.ERROR) {
      alerts.push({
        type: 'ERROR',
        message: 'Bot is in ERROR state',
        botId: bot.id,
        timestamp: new Date()
      });
    }

    // Check for inactive bots
    if (bot.status === BotStatus.STOPPED && bot.performance.totalValueLocked > 0) {
      alerts.push({
        type: 'INFO',
        message: 'Bot is stopped but has active positions',
        botId: bot.id,
        timestamp: new Date()
      });
    }

    // Add alerts to the global list
    alerts.forEach(alert => this.alerts.push(alert));
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.splice(0, this.alerts.length - 100);
    }
  }

  getRealTimeMetrics(botId: string) {
    const bot = this.activeBots.get(botId);
    if (!bot) {
      return null;
    }

    return {
      currentPrice: 2000 + (Math.random() - 0.5) * 100, // Simulated price
      priceChange24h: (Math.random() - 0.5) * 5, // Simulated price change
      volume24h: 100000 + Math.random() * 50000,
      liquidity: bot.performance.totalValueLocked,
      activePositions: bot.positions.length,
      lastUpdate: new Date()
    };
  }

  getPortfolioMetrics(userId?: string) {
    const bots = userId 
      ? Array.from(this.activeBots.values()).filter(bot => bot.userId === userId)
      : Array.from(this.activeBots.values());

    const totalValue = bots.reduce((sum, bot) => sum + bot.performance.totalValueLocked, 0);
    const totalProfit = bots.reduce((sum, bot) => sum + bot.performance.netProfit, 0);
    
    // Calculate portfolio allocation by strategy
    const strategyAllocation = new Map<string, number>();
    bots.forEach(bot => {
      const current = strategyAllocation.get(bot.strategy.type) || 0;
      strategyAllocation.set(bot.strategy.type, current + bot.performance.totalValueLocked);
    });

    const allocationPercentages = Array.from(strategyAllocation.entries()).map(([strategy, value]) => ({
      strategy,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
    }));

    return {
      totalValue,
      totalProfit,
      profitPercentage: totalValue > 0 ? (totalProfit / totalValue) * 100 : 0,
      strategyAllocation: allocationPercentages,
      diversificationScore: this.calculateDiversificationScore(allocationPercentages)
    };
  }

  private calculateDiversificationScore(allocation: Array<{ strategy: string; percentage: number }>) {
    // Calculate Herfindahl-Hirschman Index for diversification
    const hhi = allocation.reduce((sum, item) => sum + Math.pow(item.percentage, 2), 0);
    const maxHHI = 10000; // Maximum HHI (100% in one strategy)
    
    // Convert to diversification score (0-100, higher is more diversified)
    return Math.max(0, 100 - (hhi / maxHHI * 100));
  }

  clearAlerts(botId?: string) {
    if (botId) {
      this.alerts = this.alerts.filter(alert => alert.botId !== botId);
    } else {
      this.alerts = [];
    }
  }
}
