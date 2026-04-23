import { Injectable } from '@nestjs/common';
import { RiskParameters } from '../interfaces/amm-bot.interface';

export interface RiskProfile {
  name: string;
  description: string;
  riskScore: number;
  parameters: RiskParameters;
}

@Injectable()
export class RiskConfigService {
  private readonly riskProfiles: Map<string, RiskProfile> = new Map();

  constructor() {
    this.initializeDefaultProfiles();
  }

  private initializeDefaultProfiles(): void {
    // Conservative Profile
    this.riskProfiles.set('CONSERVATIVE', {
      name: 'Conservative',
      description: 'Low risk, stable returns with minimal impermanent loss',
      riskScore: 0.2,
      parameters: {
        maxPositionSize: 100000, // $100k max
        stopLossPercentage: 5,
        takeProfitPercentage: 10,
        priceRange: {
          lower: 0.85,
          upper: 1.15
        },
        rebalanceTrigger: 15,
        maxSlippage: 0.5
      }
    });

    // Moderate Profile
    this.riskProfiles.set('MODERATE', {
      name: 'Moderate',
      description: 'Balanced risk and returns with reasonable impermanent loss tolerance',
      riskScore: 0.5,
      parameters: {
        maxPositionSize: 250000, // $250k max
        stopLossPercentage: 10,
        takeProfitPercentage: 25,
        priceRange: {
          lower: 0.75,
          upper: 1.25
        },
        rebalanceTrigger: 10,
        maxSlippage: 1.0
      }
    });

    // Aggressive Profile
    this.riskProfiles.set('AGGRESSIVE', {
      name: 'Aggressive',
      description: 'High risk, high returns with higher impermanent loss tolerance',
      riskScore: 0.8,
      parameters: {
        maxPositionSize: 500000, // $500k max
        stopLossPercentage: 15,
        takeProfitPercentage: 50,
        priceRange: {
          lower: 0.6,
          upper: 1.4
        },
        rebalanceTrigger: 5,
        maxSlippage: 2.0
      }
    });

    // Custom Profile
    this.riskProfiles.set('CUSTOM', {
      name: 'Custom',
      description: 'User-defined risk parameters',
      riskScore: 0.5,
      parameters: {
        maxPositionSize: 100000,
        stopLossPercentage: 10,
        takeProfitPercentage: 20,
        priceRange: {
          lower: 0.8,
          upper: 1.2
        },
        rebalanceTrigger: 10,
        maxSlippage: 1.0
      }
    });
  }

  getRiskProfile(profileName: string): RiskProfile | undefined {
    return this.riskProfiles.get(profileName.toUpperCase());
  }

  getAllRiskProfiles(): RiskProfile[] {
    return Array.from(this.riskProfiles.values());
  }

  validateRiskParameters(parameters: RiskParameters): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate position size
    if (parameters.maxPositionSize <= 0) {
      errors.push('Max position size must be greater than 0');
    }

    // Validate stop loss and take profit
    if (parameters.stopLossPercentage < 0 || parameters.stopLossPercentage > 100) {
      errors.push('Stop loss percentage must be between 0 and 100');
    }

    if (parameters.takeProfitPercentage <= 0 || parameters.takeProfitPercentage > 1000) {
      errors.push('Take profit percentage must be between 0 and 1000');
    }

    // Validate price range
    if (parameters.priceRange.lower <= 0 || parameters.priceRange.upper <= 0) {
      errors.push('Price range bounds must be greater than 0');
    }

    if (parameters.priceRange.lower >= parameters.priceRange.upper) {
      errors.push('Lower price bound must be less than upper price bound');
    }

    // Validate rebalance trigger
    if (parameters.rebalanceTrigger < 0 || parameters.rebalanceTrigger > 100) {
      errors.push('Rebalance trigger must be between 0 and 100');
    }

    // Validate max slippage
    if (parameters.maxSlippage < 0 || parameters.maxSlippage > 100) {
      errors.push('Max slippage must be between 0 and 100');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  calculateRiskScore(parameters: RiskParameters): number {
    let score = 0;

    // Position size risk (0-0.3)
    const positionSizeRisk = Math.min(parameters.maxPositionSize / 1000000, 1) * 0.3;
    score += positionSizeRisk;

    // Stop loss risk (0-0.2)
    const stopLossRisk = (parameters.stopLossPercentage / 50) * 0.2;
    score += stopLossRisk;

    // Price range risk (0-0.3)
    const rangeWidth = parameters.priceRange.upper - parameters.priceRange.lower;
    const rangeRisk = Math.max(0, (1 - rangeWidth) / 2) * 0.3;
    score += rangeRisk;

    // Rebalance frequency risk (0-0.2)
    const rebalanceRisk = (1 - parameters.rebalanceTrigger / 100) * 0.2;
    score += rebalanceRisk;

    return Math.min(score, 1);
  }

  adjustParametersForVolatility(
    parameters: RiskParameters,
    volatility: number // Standard deviation of returns
  ): RiskParameters {
    const adjustedParams = { ...parameters };

    // Adjust price range based on volatility
    const volatilityMultiplier = 1 + (volatility * 2);
    adjustedParams.priceRange = {
      lower: 1 - (1 - parameters.priceRange.lower) * volatilityMultiplier,
      upper: 1 + (parameters.priceRange.upper - 1) * volatilityMultiplier
    };

    // Adjust rebalance trigger for higher volatility
    if (volatility > 0.1) {
      adjustedParams.rebalanceTrigger = Math.max(5, parameters.rebalanceTrigger * 0.7);
    } else if (volatility < 0.05) {
      adjustedParams.rebalanceTrigger = Math.min(20, parameters.rebalanceTrigger * 1.3);
    }

    // Adjust slippage tolerance for higher volatility
    if (volatility > 0.15) {
      adjustedParams.maxSlippage = Math.min(5, parameters.maxSlippage * 1.5);
    }

    return adjustedParams;
  }

  createCustomRiskProfile(
    name: string,
    description: string,
    parameters: RiskParameters
  ): RiskProfile {
    const validation = this.validateRiskParameters(parameters);
    if (!validation.isValid) {
      throw new Error(`Invalid risk parameters: ${validation.errors.join(', ')}`);
    }

    const riskScore = this.calculateRiskScore(parameters);

    const profile: RiskProfile = {
      name,
      description,
      riskScore,
      parameters
    };

    this.riskProfiles.set(name.toUpperCase(), profile);
    return profile;
  }

  getRecommendedProfile(
    initialCapital: number,
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH',
    experience: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  ): RiskProfile {
    // Adjust recommendation based on capital size
    let adjustedRiskTolerance = riskTolerance;
    if (initialCapital > 500000) {
      // Large capital holders tend to be more conservative
      adjustedRiskTolerance = riskTolerance === 'HIGH' ? 'MEDIUM' : 'LOW';
    } else if (initialCapital < 10000) {
      // Small capital holders might be more aggressive
      adjustedRiskTolerance = riskTolerance === 'LOW' ? 'MEDIUM' : 'HIGH';
    }

    // Adjust based on experience
    if (experience === 'BEGINNER') {
      adjustedRiskTolerance = 'LOW';
    } else if (experience === 'ADVANCED' && riskTolerance === 'HIGH') {
      adjustedRiskTolerance = 'HIGH';
    }

    switch (adjustedRiskTolerance) {
      case 'LOW':
        return this.riskProfiles.get('CONSERVATIVE')!;
      case 'HIGH':
        return this.riskProfiles.get('AGGRESSIVE')!;
      default:
        return this.riskProfiles.get('MODERATE')!;
    }
  }
}
