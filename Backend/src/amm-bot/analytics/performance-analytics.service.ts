import { Injectable } from '@nestjs/common';
import { AmmBot, PerformanceMetrics, LiquidityPosition } from '../interfaces/amm-bot.interface';
import { ImpermanentLossService, ImpermanentLossCalculation } from './impermanent-loss.service';

export interface FeeRevenueData {
  timestamp: Date;
  amount0: number;
  amount1: number;
  usdValue: number;
  source: string; // DEX name
}

export interface PerformanceComparison {
  botId: string;
  period: string; // '24h', '7d', '30d', 'all'
  feeRevenue: number;
  impermanentLoss: number;
  netProfit: number;
  netProfitPercentage: number;
  apr: number;
  sharpeRatio: number;
  maxDrawdown: number;
  volatility: number;
}

export interface StrategyComparison {
  strategyType: string;
  averageFeeRevenue: number;
  averageImpermanentLoss: number;
  averageNetProfit: number;
  winRate: number; // Percentage of bots with positive returns
  riskAdjustedReturn: number;
  sampleSize: number;
}

@Injectable()
export class PerformanceAnalyticsService {
  private feeRevenueHistory: Map<string, FeeRevenueData[]> = new Map();
  private performanceSnapshots: Map<string, PerformanceMetrics[]> = new Map();

  constructor(private readonly impermanentLossService: ImpermanentLossService) {}

  recordFeeRevenue(
    botId: string,
    amount0: number,
    amount1: number,
    usdValue: number,
    source: string
  ): void {
    if (!this.feeRevenueHistory.has(botId)) {
      this.feeRevenueHistory.set(botId, []);
    }

    const history = this.feeRevenueHistory.get(botId)!;
    history.push({
      timestamp: new Date(),
      amount0,
      amount1,
      usdValue,
      source
    });

    // Keep only last 1000 records per bot
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
  }

  recordPerformanceSnapshot(botId: string, metrics: PerformanceMetrics): void {
    if (!this.performanceSnapshots.has(botId)) {
      this.performanceSnapshots.set(botId, []);
    }

    const snapshots = this.performanceSnapshots.get(botId)!;
    snapshots.push({
      ...metrics,
      lastUpdateTime: new Date()
    });

    // Keep only last 720 snapshots (5 minutes each for 60 days)
    if (snapshots.length > 720) {
      snapshots.splice(0, snapshots.length - 720);
    }
  }

  calculatePerformanceComparison(
    botId: string,
    period: '24h' | '7d' | '30d' | 'all' = '7d'
  ): PerformanceComparison {
    const feeRevenue = this.calculateFeeRevenue(botId, period);
    const impermanentLoss = this.calculateImpermanentLoss(botId, period);
    const netProfit = feeRevenue - impermanentLoss;
    const netProfitPercentage = this.calculateNetProfitPercentage(botId, period, netProfit);
    const apr = this.calculateAPR(botId, period, netProfit);
    const sharpeRatio = this.calculateSharpeRatio(botId, period);
    const maxDrawdown = this.calculateMaxDrawdown(botId, period);
    const volatility = this.calculateVolatility(botId, period);

    return {
      botId,
      period,
      feeRevenue,
      impermanentLoss,
      netProfit,
      netProfitPercentage,
      apr,
      sharpeRatio,
      maxDrawdown,
      volatility
    };
  }

  private calculateFeeRevenue(botId: string, period: string): number {
    const history = this.feeRevenueHistory.get(botId);
    if (!history || history.length === 0) {
      return 0;
    }

    const cutoffTime = this.getCutoffTime(period);
    const relevantData = history.filter(data => data.timestamp >= cutoffTime);
    
    return relevantData.reduce((sum, data) => sum + data.usdValue, 0);
  }

  private calculateImpermanentLoss(botId: string, period: string): number {
    // This would integrate with the impermanent loss service
    // For now, return a calculated value based on position data
    const history = this.performanceSnapshots.get(botId);
    if (!history || history.length === 0) {
      return 0;
    }

    const cutoffTime = this.getCutoffTime(period);
    const relevantSnapshots = history.filter(snapshot => snapshot.lastUpdateTime >= cutoffTime);
    
    if (relevantSnapshots.length < 2) {
      return 0;
    }

    const firstSnapshot = relevantSnapshots[0];
    const lastSnapshot = relevantSnapshots[relevantSnapshots.length - 1];
    
    return lastSnapshot.impermanentLoss - firstSnapshot.impermanentLoss;
  }

  private calculateNetProfitPercentage(botId: string, period: string, netProfit: number): number {
    const snapshots = this.performanceSnapshots.get(botId);
    if (!snapshots || snapshots.length === 0) {
      return 0;
    }

    const cutoffTime = this.getCutoffTime(period);
    const firstSnapshot = snapshots.find(snapshot => snapshot.lastUpdateTime >= cutoffTime);
    
    if (!firstSnapshot || firstSnapshot.totalValueLocked === 0) {
      return 0;
    }

    return (netProfit / firstSnapshot.totalValueLocked) * 100;
  }

  private calculateAPR(botId: string, period: string, netProfit: number): number {
    const snapshots = this.performanceSnapshots.get(botId);
    if (!snapshots || snapshots.length === 0) {
      return 0;
    }

    const firstSnapshot = snapshots[0];
    if (firstSnapshot.totalValueLocked === 0) {
      return 0;
    }

    const days = this.getPeriodDays(period);
    const dailyReturn = netProfit / firstSnapshot.totalValueLocked / days;
    
    return dailyReturn * 365 * 100; // Annualized percentage
  }

  private calculateSharpeRatio(botId: string, period: string): number {
    const snapshots = this.performanceSnapshots.get(botId);
    if (!snapshots || snapshots.length < 2) {
      return 0;
    }

    const cutoffTime = this.getCutoffTime(period);
    const relevantSnapshots = snapshots.filter(snapshot => snapshot.lastUpdateTime >= cutoffTime);
    
    if (relevantSnapshots.length < 2) {
      return 0;
    }

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < relevantSnapshots.length; i++) {
      const prev = relevantSnapshots[i - 1];
      const curr = relevantSnapshots[i];
      if (prev.totalValueLocked > 0) {
        returns.push((curr.totalValueLocked - prev.totalValueLocked) / prev.totalValueLocked);
      }
    }

    if (returns.length === 0) {
      return 0;
    }

    const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Risk-free rate assumed to be 2% annually
    const riskFreeRate = 0.02 / 365;
    const excessReturn = meanReturn - riskFreeRate;

    return stdDev === 0 ? 0 : (excessReturn / stdDev) * Math.sqrt(365);
  }

  private calculateMaxDrawdown(botId: string, period: string): number {
    const snapshots = this.performanceSnapshots.get(botId);
    if (!snapshots || snapshots.length < 2) {
      return 0;
    }

    const cutoffTime = this.getCutoffTime(period);
    const relevantSnapshots = snapshots.filter(snapshot => snapshot.lastUpdateTime >= cutoffTime);
    
    if (relevantSnapshots.length < 2) {
      return 0;
    }

    let maxDrawdown = 0;
    let peak = relevantSnapshots[0].totalValueLocked;

    for (const snapshot of relevantSnapshots) {
      if (snapshot.totalValueLocked > peak) {
        peak = snapshot.totalValueLocked;
      } else {
        const drawdown = (peak - snapshot.totalValueLocked) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown * 100; // Return as percentage
  }

  private calculateVolatility(botId: string, period: string): number {
    const snapshots = this.performanceSnapshots.get(botId);
    if (!snapshots || snapshots.length < 2) {
      return 0;
    }

    const cutoffTime = this.getCutoffTime(period);
    const relevantSnapshots = snapshots.filter(snapshot => snapshot.lastUpdateTime >= cutoffTime);
    
    if (relevantSnapshots.length < 2) {
      return 0;
    }

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < relevantSnapshots.length; i++) {
      const prev = relevantSnapshots[i - 1];
      const curr = relevantSnapshots[i];
      if (prev.totalValueLocked > 0) {
        returns.push((curr.totalValueLocked - prev.totalValueLocked) / prev.totalValueLocked);
      }
    }

    if (returns.length === 0) {
      return 0;
    }

    const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev * Math.sqrt(365) * 100; // Annualized volatility as percentage
  }

  compareStrategies(bots: AmmBot[], period: '24h' | '7d' | '30d' | 'all' = '7d'): StrategyComparison[] {
    const strategyGroups = new Map<string, AmmBot[]>();

    // Group bots by strategy type
    bots.forEach(bot => {
      const strategyType = bot.strategy.type;
      if (!strategyGroups.has(strategyType)) {
        strategyGroups.set(strategyType, []);
      }
      strategyGroups.get(strategyType)!.push(bot);
    });

    const comparisons: StrategyComparison[] = [];

    strategyGroups.forEach((strategyBots, strategyType) => {
      const performances = strategyBots.map(bot => 
        this.calculatePerformanceComparison(bot.id, period)
      );

      const averageFeeRevenue = performances.reduce((sum, p) => sum + p.feeRevenue, 0) / performances.length;
      const averageImpermanentLoss = performances.reduce((sum, p) => sum + p.impermanentLoss, 0) / performances.length;
      const averageNetProfit = performances.reduce((sum, p) => sum + p.netProfit, 0) / performances.length;
      const winRate = (performances.filter(p => p.netProfit > 0).length / performances.length) * 100;
      
      // Risk-adjusted return (Sharpe ratio weighted by net profit)
      const riskAdjustedReturn = performances.reduce((sum, p) => 
        sum + (p.sharpeRatio * Math.abs(p.netProfit)), 0
      ) / performances.reduce((sum, p) => sum + Math.abs(p.netProfit), 0);

      comparisons.push({
        strategyType,
        averageFeeRevenue,
        averageImpermanentLoss,
        averageNetProfit,
        winRate,
        riskAdjustedReturn: isNaN(riskAdjustedReturn) ? 0 : riskAdjustedReturn,
        sampleSize: performances.length
      });
    });

    return comparisons;
  }

  getTopPerformingBots(bots: AmmBot[], period: '24h' | '7d' | '30d' | 'all' = '7d', limit: number = 10): Array<{
    bot: AmmBot;
    performance: PerformanceComparison;
    rank: number;
  }> {
    const performances = bots.map(bot => ({
      bot,
      performance: this.calculatePerformanceComparison(bot.id, period)
    }));

    // Sort by net profit (descending)
    performances.sort((a, b) => b.performance.netProfit - a.performance.netProfit);

    return performances.slice(0, limit).map((item, index) => ({
      ...item,
      rank: index + 1
    }));
  }

  generatePerformanceReport(botId: string, period: '24h' | '7d' | '30d' | 'all' = '7d'): {
    summary: PerformanceComparison;
    feeBreakdown: Array<{ source: string; amount: number; percentage: number }>;
    ilTrend: Array<{ date: string; il: number }>;
    recommendations: string[];
  } {
    const summary = this.calculatePerformanceComparison(botId, period);
    const feeBreakdown = this.getFeeBreakdown(botId, period);
    const ilTrend = this.getILTrend(botId, period);
    const recommendations = this.generateRecommendations(summary);

    return {
      summary,
      feeBreakdown,
      ilTrend,
      recommendations
    };
  }

  private getFeeBreakdown(botId: string, period: string): Array<{ source: string; amount: number; percentage: number }> {
    const history = this.feeRevenueHistory.get(botId);
    if (!history || history.length === 0) {
      return [];
    }

    const cutoffTime = this.getCutoffTime(period);
    const relevantData = history.filter(data => data.timestamp >= cutoffTime);
    
    const sourceTotals = new Map<string, number>();
    let totalFees = 0;

    relevantData.forEach(data => {
      const current = sourceTotals.get(data.source) || 0;
      sourceTotals.set(data.source, current + data.usdValue);
      totalFees += data.usdValue;
    });

    const breakdown: Array<{ source: string; amount: number; percentage: number }> = [];
    sourceTotals.forEach((amount, source) => {
      breakdown.push({
        source,
        amount,
        percentage: totalFees > 0 ? (amount / totalFees) * 100 : 0
      });
    });

    return breakdown.sort((a, b) => b.amount - a.amount);
  }

  private getILTrend(botId: string, period: string): Array<{ date: string; il: number }> {
    const snapshots = this.performanceSnapshots.get(botId);
    if (!snapshots || snapshots.length === 0) {
      return [];
    }

    const cutoffTime = this.getCutoffTime(period);
    const relevantSnapshots = snapshots.filter(snapshot => snapshot.lastUpdateTime >= cutoffTime);
    
    return relevantSnapshots.map(snapshot => ({
      date: snapshot.lastUpdateTime.toISOString().split('T')[0],
      il: snapshot.impermanentLoss
    }));
  }

  private generateRecommendations(performance: PerformanceComparison): string[] {
    const recommendations: string[] = [];

    if (performance.netProfit < 0) {
      recommendations.push('Consider adjusting strategy parameters as current position is unprofitable');
    }

    if (performance.impermanentLoss > performance.feeRevenue) {
      recommendations.push('Impermanent loss exceeds fee revenue - consider wider price ranges');
    }

    if (performance.sharpeRatio < 1) {
      recommendations.push('Low risk-adjusted returns - consider reducing position size or adjusting risk parameters');
    }

    if (performance.maxDrawdown > 20) {
      recommendations.push('High drawdown detected - implement stricter stop-loss mechanisms');
    }

    if (performance.volatility > 30) {
      recommendations.push('High volatility - consider more frequent rebalancing');
    }

    if (performance.apr < 5) {
      recommendations.push('Low APR - consider exploring higher-yield opportunities or different DEXes');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance is within acceptable parameters');
    }

    return recommendations;
  }

  private getCutoffTime(period: string): Date {
    const now = new Date();
    switch (period) {
      case '24h':
        return new Date(now.getTime() - (24 * 60 * 60 * 1000));
      case '7d':
        return new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
      case '30d':
        return new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      case 'all':
        return new Date(0);
      default:
        return new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    }
  }

  private getPeriodDays(period: string): number {
    switch (period) {
      case '24h':
        return 1;
      case '7d':
        return 7;
      case '30d':
        return 30;
      case 'all':
        return 365;
      default:
        return 7;
    }
  }
}
