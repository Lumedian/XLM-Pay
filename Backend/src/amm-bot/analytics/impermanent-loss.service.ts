import { Injectable } from '@nestjs/common';
import { LiquidityPosition, MarketData } from '../interfaces/amm-bot.interface';

export interface ImpermanentLossCalculation {
  initialPrice: number;
  currentPrice: number;
  priceRatio: number;
  impermanentLossPercentage: number;
  impermanentLossAmount: number;
  hodlValue: number;
  liquidityValue: number;
  timestamp: Date;
}

export interface ImpermanentLossHistory {
  positionId: string;
  calculations: ImpermanentLossCalculation[];
  maxILPercentage: number;
  averageILPercentage: number;
  currentILPercentage: number;
  totalILAmount: number;
}

@Injectable()
export class ImpermanentLossService {
  private ilHistory: Map<string, ImpermanentLossHistory> = new Map();

  calculateImpermanentLoss(
    position: LiquidityPosition,
    initialPrice: number,
    currentPrice: number,
    initialAmount0: number,
    initialAmount1: number
  ): ImpermanentLossCalculation {
    const priceRatio = currentPrice / initialPrice;
    
    // Calculate current value if just holding (HODL)
    const hodlValue = (initialAmount0 * currentPrice) + initialAmount1;
    
    // Calculate current value in liquidity position
    const liquidityValue = this.calculateLiquidityValue(
      position,
      currentPrice,
      initialAmount0,
      initialAmount1
    );
    
    // Calculate impermanent loss
    const impermanentLossAmount = hodlValue - liquidityValue;
    const impermanentLossPercentage = (impermanentLossAmount / hodlValue) * 100;

    return {
      initialPrice,
      currentPrice,
      priceRatio,
      impermanentLossPercentage,
      impermanentLossAmount,
      hodlValue,
      liquidityValue,
      timestamp: new Date()
    };
  }

  private calculateLiquidityValue(
    position: LiquidityPosition,
    currentPrice: number,
    initialAmount0: number,
    initialAmount1: number
  ): number {
    const initialPrice = initialAmount1 / initialAmount0;
    const priceRatio = currentPrice / initialPrice;
    
    // For concentrated liquidity positions
    if (position.tickLower !== undefined && position.tickUpper !== undefined) {
      return this.calculateConcentratedLiquidityValue(
        position,
        currentPrice,
        initialPrice,
        priceRatio
      );
    }
    
    // For constant product positions (50/50)
    return this.calculateConstantProductValue(
      initialAmount0,
      initialAmount1,
      currentPrice,
      initialPrice
    );
  }

  private calculateConstantProductValue(
    initialAmount0: number,
    initialAmount1: number,
    currentPrice: number,
    initialPrice: number
  ): number {
    // For CP AMM, liquidity value = 2 * sqrt(amount0 * amount1 * priceRatio)
    const sqrtPriceRatio = Math.sqrt(currentPrice / initialPrice);
    return 2 * sqrtPriceRatio * Math.sqrt(initialAmount0 * initialAmount1);
  }

  private calculateConcentratedLiquidityValue(
    position: LiquidityPosition,
    currentPrice: number,
    initialPrice: number,
    priceRatio: number
  ): number {
    const lowerPrice = this.tickToPrice(position.tickLower!);
    const upperPrice = this.tickToPrice(position.tickUpper!);
    
    if (currentPrice <= lowerPrice) {
      // All token0
      return position.amount0;
    } else if (currentPrice >= upperPrice) {
      // All token1
      return position.amount1 * currentPrice;
    } else {
      // Both tokens - calculate based on current price within range
      const liquidity = Math.sqrt(position.amount0 * position.amount1);
      const amount0 = liquidity * (Math.sqrt(upperPrice) - Math.sqrt(currentPrice)) / 
                     (Math.sqrt(upperPrice) - Math.sqrt(lowerPrice));
      const amount1 = liquidity * (Math.sqrt(currentPrice) - Math.sqrt(lowerPrice)) / 
                     (Math.sqrt(upperPrice) - Math.sqrt(lowerPrice));
      
      return amount0 + (amount1 * currentPrice);
    }
  }

  trackImpermanentLoss(
    positionId: string,
    calculation: ImpermanentLossCalculation
  ): void {
    if (!this.ilHistory.has(positionId)) {
      this.ilHistory.set(positionId, {
        positionId,
        calculations: [],
        maxILPercentage: 0,
        averageILPercentage: 0,
        currentILPercentage: 0,
        totalILAmount: 0
      });
    }

    const history = this.ilHistory.get(positionId)!;
    history.calculations.push(calculation);
    
    // Update statistics
    history.maxILPercentage = Math.max(
      history.maxILPercentage,
      calculation.impermanentLossPercentage
    );
    
    history.currentILPercentage = calculation.impermanentLossPercentage;
    history.totalILAmount += calculation.impermanentLossAmount;
    
    // Calculate average
    const totalIL = history.calculations.reduce((sum, calc) => sum + calc.impermanentLossPercentage, 0);
    history.averageILPercentage = totalIL / history.calculations.length;
  }

  getImpermanentLossHistory(positionId: string): ImpermanentLossHistory | undefined {
    return this.ilHistory.get(positionId);
  }

  calculateHistoricalIL(positionId: string, hours: number = 24): ImpermanentLossCalculation[] {
    const history = this.ilHistory.get(positionId);
    if (!history) {
      return [];
    }

    const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
    return history.calculations.filter(calc => calc.timestamp >= cutoffTime);
  }

  calculateILProjection(
    position: LiquidityPosition,
    currentPrice: number,
    volatility: number,
    timeHorizon: number // days
  ): {
    expectedIL: number;
    bestCaseIL: number;
    worstCaseIL: number;
    confidenceInterval: number;
  } {
    // Monte Carlo simulation for IL projection
    const simulations = 1000;
    const results: number[] = [];

    for (let i = 0; i < simulations; i++) {
      const randomPrice = this.generateRandomPricePath(
        currentPrice,
        volatility,
        timeHorizon
      );
      
      const il = this.calculateImpermanentLoss(
        position,
        currentPrice,
        randomPrice,
        position.amount0,
        position.amount1
      );
      
      results.push(il.impermanentLossPercentage);
    }

    results.sort((a, b) => a - b);
    
    const expectedIL = results.reduce((sum, val) => sum + val, 0) / results.length;
    const bestCaseIL = results[Math.floor(results.length * 0.1)]; // 10th percentile
    const worstCaseIL = results[Math.floor(results.length * 0.9)]; // 90th percentile
    const confidenceInterval = results[Math.floor(results.length * 0.75)] - 
                             results[Math.floor(results.length * 0.25)]; // IQR

    return {
      expectedIL,
      bestCaseIL,
      worstCaseIL,
      confidenceInterval
    };
  }

  private generateRandomPricePath(
    initialPrice: number,
    volatility: number,
    days: number
  ): number {
    // Geometric Brownian Motion simulation
    const dt = 1 / 365; // daily steps
    const drift = 0; // Assuming no drift for simplicity
    let price = initialPrice;

    for (let i = 0; i < days; i++) {
      const randomShock = this.gaussianRandom() * Math.sqrt(dt);
      price = price * Math.exp((drift - 0.5 * volatility * volatility) * dt + volatility * randomShock);
    }

    return price;
  }

  private gaussianRandom(): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private tickToPrice(tick: number): number {
    return Math.pow(1.0001, tick);
  }

  getILStatistics(positionId: string): {
    maxIL: number;
    averageIL: number;
    currentIL: number;
    totalILAmount: number;
    daysTracked: number;
  } | undefined {
    const history = this.ilHistory.get(positionId);
    if (!history) {
      return undefined;
    }

    const firstCalculation = history.calculations[0];
    const daysTracked = firstCalculation 
      ? Math.ceil((Date.now() - firstCalculation.timestamp.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      maxIL: history.maxILPercentage,
      averageIL: history.averageILPercentage,
      currentIL: history.currentILPercentage,
      totalILAmount: history.totalILAmount,
      daysTracked
    };
  }

  compareILStrategies(
    positionId: string,
    alternativeStrategies: Array<{
      name: string;
      position: LiquidityPosition;
    }>
  ): Array<{
    strategyName: string;
    currentIL: number;
    projectedIL: number;
    riskScore: number;
  }> {
    const currentHistory = this.ilHistory.get(positionId);
    if (!currentHistory) {
      return [];
    }

    const currentIL = currentHistory.currentILPercentage;
    const results = [];

    for (const strategy of alternativeStrategies) {
      // Calculate projected IL for alternative strategy
      const latestCalc = currentHistory.calculations[currentHistory.calculations.length - 1];
      const projectedIL = this.calculateImpermanentLoss(
        strategy.position,
        latestCalc.initialPrice,
        latestCalc.currentPrice,
        strategy.position.amount0,
        strategy.position.amount1
      ).impermanentLossPercentage;

      // Calculate risk score based on position characteristics
      const riskScore = this.calculateRiskScore(strategy.position);

      results.push({
        strategyName: strategy.name,
        currentIL,
        projectedIL,
        riskScore
      });
    }

    return results;
  }

  private calculateRiskScore(position: LiquidityPosition): number {
    let risk = 0;

    // Concentrated liquidity is riskier
    if (position.tickLower !== undefined && position.tickUpper !== undefined) {
      const range = position.tickUpper - position.tickLower;
      risk += Math.max(0, (1000 - range) / 1000) * 0.5;
    }

    // Higher fee tiers might indicate riskier pools
    if (position.feeTier) {
      risk += (position.feeTier / 10000) * 0.3;
    }

    return Math.min(risk, 1);
  }
}
