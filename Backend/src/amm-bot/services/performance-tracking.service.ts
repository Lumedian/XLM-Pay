import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerformanceMetric, MetricType } from '../entities/performance-metric.entity';
import { BotStrategy } from '../entities/bot-strategy.entity';
import { BotPosition } from '../entities/bot-position.entity';

@Injectable()
export class PerformanceTrackingService {
  private readonly logger = new Logger(PerformanceTrackingService.name);

  constructor(
    @InjectRepository(PerformanceMetric)
    private performanceMetricRepository: Repository<PerformanceMetric>,
    @InjectRepository(BotStrategy)
    private strategyRepository: Repository<BotStrategy>,
    @InjectRepository(BotPosition)
    private positionRepository: Repository<BotPosition>,
  ) {}

  async trackPerformance(strategyId: string): Promise<void> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
      relations: ['positions'],
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    const timestamp = new Date();
    const timeframes = ['1h', '1d', '1w', '1m'];

    for (const timeframe of timeframes) {
      await this.calculateAndStoreMetrics(strategy, timeframe, timestamp);
    }

    this.logger.log(`Tracked performance for strategy: ${strategyId}`);
  }

  async calculatePnL(strategyId: string, timeframe: string): Promise<{
    totalPnL: string;
    feeRevenue: string;
    impermanentLoss: string;
    netPnL: string;
  }> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
      relations: ['positions'],
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    let totalFees = '0';
    let totalIL = '0';

    for (const position of strategy.positions) {
      const positionFees = parseFloat(position.feesEarnedA) + parseFloat(position.feesEarnedB);
      const positionIL = parseFloat(position.impermanentLoss || '0');
      
      totalFees = (parseFloat(totalFees) + positionFees).toString();
      totalIL = (parseFloat(totalIL) + positionIL).toString();
    }

    const totalDeposited = parseFloat(strategy.totalDeposited || '0');
    const currentLiquidity = parseFloat(strategy.currentLiquidity || '0');
    const unrealizedPnL = currentLiquidity - totalDeposited;
    const realizedPnL = parseFloat(totalFees) - parseFloat(totalIL);
    const totalPnL = unrealizedPnL + realizedPnL;

    return {
      totalPnL: totalPnL.toString(),
      feeRevenue: totalFees,
      impermanentLoss: totalIL,
      netPnL: totalPnL.toString(),
    };
  }

  async calculateAPR(strategyId: string): Promise<{
    grossAPR: string;
    netAPR: string;
    feeAPR: string;
    ilAPR: string;
  }> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    const totalDeposited = parseFloat(strategy.totalDeposited || '0');
    if (totalDeposited === 0) {
      return {
        grossAPR: '0',
        netAPR: '0',
        feeAPR: '0',
        ilAPR: '0',
      };
    }

    const timeSinceCreation = Date.now() - strategy.createdAt.getTime();
    const daysSinceCreation = timeSinceCreation / (1000 * 60 * 60 * 24);
    const yearlyMultiplier = 365 / Math.max(daysSinceCreation, 1);

    const totalFees = parseFloat(strategy.totalFeesEarned || '0');
    const totalIL = parseFloat(strategy.impermanentLoss || '0');
    const currentLiquidity = parseFloat(strategy.currentLiquidity || '0');
    const unrealizedPnL = currentLiquidity - totalDeposited;
    const totalReturn = totalFees - totalIL + unrealizedPnL;

    const grossAPR = (totalReturn / totalDeposited) * yearlyMultiplier * 100;
    const feeAPR = (totalFees / totalDeposited) * yearlyMultiplier * 100;
    const ilAPR = (totalIL / totalDeposited) * yearlyMultiplier * 100;
    const netAPR = grossAPR - ilAPR;

    return {
      grossAPR: grossAPR.toFixed(2),
      netAPR: netAPR.toFixed(2),
      feeAPR: feeAPR.toFixed(2),
      ilAPR: ilAPR.toFixed(2),
    };
  }

  async getTVL(strategyId: string): Promise<string> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    return strategy.currentLiquidity || '0';
  }

  async getPerformanceHistory(
    strategyId: string,
    metricType: MetricType,
    timeframe: string,
    limit: number = 100,
  ): Promise<PerformanceMetric[]> {
    return await this.performanceMetricRepository.find({
      where: {
        strategyId,
        metricType,
        timeframe,
      },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async getPerformanceDashboard(strategyId: string): Promise<{
    currentMetrics: {
      tvl: string;
      totalPnL: string;
      netAPR: string;
      feeRevenue: string;
      impermanentLoss: string;
    };
    historicalData: {
      pnl: PerformanceMetric[];
      apr: PerformanceMetric[];
      tvl: PerformanceMetric[];
      volume: PerformanceMetric[];
    };
    breakdown: {
      byDex: Record<string, any>;
      byToken: Record<string, any>;
    };
  }> {
    const [pnl, apr, tvl, volume] = await Promise.all([
      this.getPerformanceHistory(strategyId, MetricType.PNL, '1d', 30),
      this.getPerformanceHistory(strategyId, MetricType.APR, '1d', 30),
      this.getPerformanceHistory(strategyId, MetricType.TVL, '1d', 30),
      this.getPerformanceHistory(strategyId, MetricType.VOLUME, '1d', 30),
    ]);

    const currentPnL = await this.calculatePnL(strategyId, '1d');
    const currentAPR = await this.calculateAPR(strategyId);
    const currentTVL = await this.getTVL(strategyId);

    const breakdown = await this.calculatePerformanceBreakdown(strategyId);

    return {
      currentMetrics: {
        tvl: currentTVL,
        totalPnL: currentPnL.totalPnL,
        netAPR: currentAPR.netAPR,
        feeRevenue: currentPnL.feeRevenue,
        impermanentLoss: currentPnL.impermanentLoss,
      },
      historicalData: {
        pnl,
        apr,
        tvl,
        volume,
      },
      breakdown,
    };
  }

  async compareStrategies(
    strategyIds: string[],
    metricType: MetricType,
    timeframe: string,
  ): Promise<Array<{
    strategyId: string;
    strategyName: string;
    currentValue: string;
    changePercentage: string;
    historical: PerformanceMetric[];
  }>> {
    const strategies = await this.strategyRepository.findByIds(strategyIds);
    const comparison = [];

    for (const strategy of strategies) {
      const latestMetric = await this.performanceMetricRepository.findOne({
        where: {
          strategyId: strategy.id,
          metricType,
          timeframe,
        },
        order: { timestamp: 'DESC' },
      });

      const historical = await this.getPerformanceHistory(strategy.id, metricType, timeframe, 30);

      comparison.push({
        strategyId: strategy.id,
        strategyName: strategy.name,
        currentValue: latestMetric?.value || '0',
        changePercentage: latestMetric?.changePercentage || '0',
        historical,
      });
    }

    return comparison;
  }

  private async calculateAndStoreMetrics(
    strategy: BotStrategy,
    timeframe: string,
    timestamp: Date,
  ): Promise<void> {
    const metrics = await Promise.all([
      this.calculatePnL(strategy.id, timeframe),
      this.calculateAPR(strategy.id),
      this.getTVL(strategy.id),
      this.calculateVolume(strategy.id, timeframe),
    ]);

    const metricTypes = [MetricType.PNL, MetricType.APR, MetricType.TVL, MetricType.VOLUME];

    for (let i = 0; i < metrics.length; i++) {
      const metric = metrics[i];
      const metricType = metricTypes[i];

      let value: string;
      let breakdown: any;

      switch (metricType) {
        case MetricType.PNL:
          value = (metric as any).totalPnL;
          break;
        case MetricType.APR:
          value = (metric as any).netAPR;
          break;
        case MetricType.TVL:
          value = metric as string;
          break;
        case MetricType.VOLUME:
          value = metric as string;
          break;
      }

      // Get previous value for change calculation
      const previousMetric = await this.performanceMetricRepository.findOne({
        where: {
          strategyId: strategy.id,
          metricType,
          timeframe,
        },
        order: { timestamp: 'DESC' },
      });

      const changePercentage = previousMetric
        ? ((parseFloat(value) - parseFloat(previousMetric.value)) / parseFloat(previousMetric.value) * 100).toString()
        : '0';

      const performanceMetric = this.performanceMetricRepository.create({
        strategyId: strategy.id,
        metricType,
        value,
        previousValue: previousMetric?.value,
        changePercentage,
        breakdown,
        timestamp,
        timeframe,
      });

      await this.performanceMetricRepository.save(performanceMetric);
    }
  }

  private async calculateVolume(strategyId: string, timeframe: string): Promise<string> {
    // Mock volume calculation - would integrate with DEX APIs
    return (Math.random() * 10000).toString();
  }

  private async calculatePerformanceBreakdown(strategyId: string): Promise<{
    byDex: Record<string, any>;
    byToken: Record<string, any>;
  }> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId },
      relations: ['positions'],
    });

    if (!strategy) {
      return { byDex: {}, byToken: {} };
    }

    const byDex: Record<string, any> = {};
    const byToken: Record<string, any> = {};

    for (const position of strategy.positions) {
      // Breakdown by DEX
      if (!byDex[position.dexName]) {
        byDex[position.dexName] = {
          liquidity: '0',
          fees: '0',
          impermanentLoss: '0',
        };
      }
      
      const positionValue = parseFloat(position.amountA) + parseFloat(position.amountB);
      byDex[position.dexName].liquidity = (
        parseFloat(byDex[position.dexName].liquidity) + positionValue
      ).toString();
      
      byDex[position.dexName].fees = (
        parseFloat(byDex[position.dexName].fees) + 
        parseFloat(position.feesEarnedA) + parseFloat(position.feesEarnedB)
      ).toString();

      // Breakdown by Token
      [position.tokenA, position.tokenB].forEach(token => {
        if (!byToken[token]) {
          byToken[token] = {
            amount: '0',
            fees: '0',
          };
        }
      });

      byToken[position.tokenA].amount = (
        parseFloat(byToken[position.tokenA].amount) + parseFloat(position.amountA)
      ).toString();
      byToken[position.tokenA].fees = (
        parseFloat(byToken[position.tokenA].fees) + parseFloat(position.feesEarnedA)
      ).toString();

      byToken[position.tokenB].amount = (
        parseFloat(byToken[position.tokenB].amount) + parseFloat(position.amountB)
      ).toString();
      byToken[position.tokenB].fees = (
        parseFloat(byToken[position.tokenB].fees) + parseFloat(position.feesEarnedB)
      ).toString();
    }

    return { byDex, byToken };
  }
}
