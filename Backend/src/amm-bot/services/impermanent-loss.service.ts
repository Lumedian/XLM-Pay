import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotPosition } from '../entities/bot-position.entity';
import { BotStrategy } from '../entities/bot-strategy.entity';

@Injectable()
export class ImpermanentLossService {
  private readonly logger = new Logger(ImpermanentLossService.name);

  constructor(
    @InjectRepository(BotPosition)
    private positionRepository: Repository<BotPosition>,
    @InjectRepository(BotStrategy)
    private strategyRepository: Repository<BotStrategy>,
  ) {}

  async calculateImpermanentLoss(positionId: string): Promise<{
    currentIL: string;
    ilPercentage: string;
    priceRatio: string;
    initialPriceRatio: string;
  }> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
      relations: ['strategy'],
    });

    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    const currentPrice = await this.getCurrentPrice(position.tokenA, position.tokenB);
    const initialPrice = await this.getInitialPrice(position);

    const priceRatio = currentPrice / initialPrice;
    const ilPercentage = this.calculateILPercentage(priceRatio);

    const currentIL = this.calculateILAmount(position, ilPercentage);

    // Update position with current IL
    position.impermanentLoss = currentIL.toString();
    if (position.priceRange) {
      position.priceRange.currentPrice = currentPrice.toString();
    }
    await this.positionRepository.save(position);

    return {
      currentIL: currentIL.toString(),
      ilPercentage: ilPercentage.toString(),
      priceRatio: priceRatio.toString(),
      initialPriceRatio: initialPrice.toString(),
    };
  }

  async calculateStrategyIL(strategyId: string): Promise<{
    totalIL: string;
    ilPercentage: string;
    positions: Array<{
      positionId: string;
      dexName: string;
      il: string;
      ilPercentage: string;
    }>;
  }> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
      relations: ['positions'],
    });

    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    let totalIL = 0;
    const positionResults = [];

    for (const position of strategy.positions) {
      const ilResult = await this.calculateImpermanentLoss(position.id);
      const ilAmount = parseFloat(ilResult.currentIL);
      
      totalIL += ilAmount;
      positionResults.push({
        positionId: position.id,
        dexName: position.dexName,
        il: ilResult.currentIL,
        ilPercentage: ilResult.ilPercentage,
      });
    }

    const totalLiquidity = parseFloat(strategy.currentLiquidity || '0');
    const totalILPercentage = totalLiquidity > 0 ? (totalIL / totalLiquidity) * 100 : 0;

    // Update strategy with total IL
    strategy.impermanentLoss = totalIL.toString();
    await this.strategyRepository.save(strategy);

    return {
      totalIL: totalIL.toString(),
      ilPercentage: totalILPercentage.toString(),
      positions: positionResults,
    };
  }

  async trackILHistory(positionId: string): Promise<Array<{
    timestamp: Date;
    il: string;
    ilPercentage: string;
    priceRatio: string;
  }>> {
    // This would typically store IL history in a separate table
    // For now, return mock historical data
    const history = [];
    const now = new Date();
    
    for (let i = 0; i < 30; i++) {
      const timestamp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const mockIL = (Math.random() * 0.1 - 0.05).toString(); // -5% to +5%
      const mockILPercentage = (parseFloat(mockIL) * 100).toString();
      
      history.push({
        timestamp,
        il: mockIL,
        ilPercentage: mockILPercentage,
        priceRatio: (1 + Math.random() * 0.2 - 0.1).toString(), // ±10% price variation
      });
    }

    return history;
  }

  async getILThresholdAlerts(strategyId: string): Promise<Array<{
    positionId: string;
    currentIL: string;
    threshold: string;
    alertLevel: 'warning' | 'critical';
    recommendation: string;
  }>> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
      relations: ['positions'],
    });

    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    const alerts = [];
    const ilThreshold = strategy.configuration.rebalanceTriggers?.impermanentLossThreshold || 0.1; // 10% default

    for (const position of strategy.positions) {
      const ilResult = await this.calculateImpermanentLoss(position.id);
      const ilPercentage = parseFloat(ilResult.ilPercentage);

      if (ilPercentage > ilThreshold * 100) {
        const alertLevel = ilPercentage > ilThreshold * 200 ? 'critical' : 'warning';
        const recommendation = this.getILRecommendation(ilPercentage, alertLevel);

        alerts.push({
          positionId: position.id,
          currentIL: ilResult.currentIL,
          threshold: (ilThreshold * 100).toString(),
          alertLevel,
          recommendation,
        });
      }
    }

    return alerts;
  }

  async compareILvsFees(strategyId: string, timeframe: string = '1d'): Promise<{
    totalFees: string;
    totalIL: string;
    netRevenue: string;
    feeToILRatio: string;
    recommendation: string;
  }> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
      relations: ['positions'],
    });

    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    let totalFees = 0;
    let totalIL = 0;

    for (const position of strategy.positions) {
      totalFees += parseFloat(position.feesEarnedA) + parseFloat(position.feesEarnedB);
      totalIL += parseFloat(position.impermanentLoss || '0');
    }

    const netRevenue = totalFees - totalIL;
    const feeToILRatio = totalIL > 0 ? totalFees / totalIL : Infinity;

    const recommendation = this.getFeeVsILRecommendation(totalFees, totalIL, netRevenue);

    return {
      totalFees: totalFees.toString(),
      totalIL: totalIL.toString(),
      netRevenue: netRevenue.toString(),
      feeToILRatio: feeToILRatio === Infinity ? 'Infinity' : feeToILRatio.toString(),
      recommendation,
    };
  }

  private async getCurrentPrice(tokenA: string, tokenB: string): Promise<number> {
    // Mock price oracle - would integrate with real price feeds
    return 1.0 + (Math.random() * 0.2 - 0.1); // ±10% variation
  }

  private async getInitialPrice(position: BotPosition): Promise<number> {
    // Mock initial price - would be stored when position is created
    return 1.0;
  }

  private calculateILPercentage(priceRatio: number): number {
    // IL formula for 50/50 pool: IL = 2 * sqrt(priceRatio) / (1 + priceRatio) - 1
    if (priceRatio <= 0) return 0;
    
    const sqrtRatio = Math.sqrt(priceRatio);
    const il = 2 * sqrtRatio / (1 + priceRatio) - 1;
    
    return il * 100; // Convert to percentage
  }

  private calculateILAmount(position: BotPosition, ilPercentage: number): number {
    const totalValue = parseFloat(position.amountA) + parseFloat(position.amountB);
    return totalValue * (ilPercentage / 100);
  }

  private getILRecommendation(ilPercentage: number, alertLevel: 'warning' | 'critical'): string {
    if (alertLevel === 'critical') {
      return 'Critical impermanent loss detected. Consider closing position or rebalancing immediately.';
    }

    if (ilPercentage > 15) {
      return 'High impermanent loss. Monitor closely and consider rebalancing if trend continues.';
    }

    if (ilPercentage > 10) {
      return 'Moderate impermanent loss. Monitor price movements and fee revenue.';
    }

    return 'Low impermanent loss. Position performing within normal parameters.';
  }

  private getFeeVsILRecommendation(
    totalFees: number,
    totalIL: number,
    netRevenue: number,
  ): string {
    if (netRevenue < 0 && totalIL > totalFees * 2) {
      return 'Impermanent loss significantly outweighs fee revenue. Consider strategy adjustment.';
    }

    if (netRevenue < 0) {
      return 'Currently experiencing net loss. Monitor for recovery or consider rebalancing.';
    }

    if (totalFees > totalIL * 3) {
      return 'Strong fee revenue performance. Strategy is effectively compensating for impermanent loss.';
    }

    return 'Balanced fee revenue and impermanent loss. Continue monitoring performance.';
  }
}
