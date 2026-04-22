import { Injectable, Logger } from '@nestjs/common';
import * as ss from 'simple-statistics';

export interface DifferentialPrivacyResult {
  value: number;
  noiseAdded: number;
  epsilon: number;
  confidenceInterval?: [number, number];
  isReliable: boolean;
}

export interface PrivacyParameters {
  epsilon: number;
  delta?: number;
  sensitivity?: number;
  mechanism?: 'laplace' | 'gaussian';
}

@Injectable()
export class DifferentialPrivacyService {
  private readonly logger = new Logger(DifferentialPrivacyService.name);

  /**
   * Add calibrated Laplace noise to achieve differential privacy
   */
  addLaplaceNoise(value: number, epsilon: number, sensitivity: number = 1): DifferentialPrivacyResult {
    if (epsilon <= 0) {
      throw new Error('Epsilon must be positive');
    }

    const scale = sensitivity / epsilon;
    const noise = this.generateLaplaceNoise(0, scale);
    const noisyValue = value + noise;
    
    // Calculate confidence interval (95% CI)
    const confidenceInterval = this.calculateConfidenceInterval(noisyValue, scale, 0.95);
    
    // Determine if result is reliable (signal-to-noise ratio > 1)
    const signalToNoiseRatio = Math.abs(value) / scale;
    const isReliable = signalToNoiseRatio > 1;

    this.logger.debug(`Added Laplace noise: ${noise.toFixed(4)} (scale: ${scale.toFixed(4)})`);

    return {
      value: noisyValue,
      noiseAdded: noise,
      epsilon,
      confidenceInterval,
      isReliable,
    };
  }

  /**
   * Add calibrated Gaussian noise for (epsilon, delta)-differential privacy
   */
  addGaussianNoise(value: number, epsilon: number, delta: number = 1e-5, sensitivity: number = 1): DifferentialPrivacyResult {
    if (epsilon <= 0 || delta <= 0 || delta >= 1) {
      throw new Error('Invalid epsilon or delta parameters');
    }

    const sigma = this.calculateGaussianSigma(epsilon, delta, sensitivity);
    const noise = this.generateGaussianNoise(0, sigma);
    const noisyValue = value + noise;
    
    const confidenceInterval = this.calculateConfidenceInterval(noisyValue, sigma, 0.95);
    const signalToNoiseRatio = Math.abs(value) / sigma;
    const isReliable = signalToNoiseRatio > 1;

    this.logger.debug(`Added Gaussian noise: ${noise.toFixed(4)} (sigma: ${sigma.toFixed(4)})`);

    return {
      value: noisyValue,
      noiseAdded: noise,
      epsilon,
      confidenceInterval,
      isReliable,
    };
  }

  /**
   * Apply differential privacy to count queries
   */
  privateCount(count: number, epsilon: number): DifferentialPrivacyResult {
    return this.addLaplaceNoise(count, epsilon, 1);
  }

  /**
   * Apply differential privacy to sum queries
   */
  privateSum(sum: number, epsilon: number, bounds: [number, number]): DifferentialPrivacyResult {
    const sensitivity = Math.max(Math.abs(bounds[0]), Math.abs(bounds[1]));
    return this.addLaplaceNoise(sum, epsilon, sensitivity);
  }

  /**
   * Apply differential privacy to average queries
   */
  privateAverage(average: number, count: number, epsilon: number, bounds: [number, number]): DifferentialPrivacyResult {
    // Split epsilon between count and sum
    const epsilonCount = epsilon / 2;
    const epsilonSum = epsilon / 2;

    const privateCountResult = this.privateCount(count, epsilonCount);
    const privateSumResult = this.privateSum(average * count, epsilonSum, bounds);

    if (privateCountResult.value <= 0) {
      // Avoid division by zero or negative counts
      return {
        value: 0,
        noiseAdded: 0,
        epsilon,
        isReliable: false,
      };
    }

    const privateAverage = privateSumResult.value / privateCountResult.value;
    const totalNoise = Math.abs(privateAverage - average);

    return {
      value: privateAverage,
      noiseAdded: totalNoise,
      epsilon,
      isReliable: privateCountResult.isReliable && privateSumResult.isReliable,
    };
  }

  /**
   * Apply differential privacy to histogram queries
   */
  privateHistogram(bins: number[], epsilon: number): DifferentialPrivacyResult[] {
    const epsilonPerBin = epsilon / bins.length;
    return bins.map(bin => this.privateCount(bin, epsilonPerBin));
  }

  /**
   * Optimize epsilon allocation for multiple queries
   */
  optimizeEpsilonAllocation(totalEpsilon: number, queryWeights: number[]): number[] {
    const totalWeight = queryWeights.reduce((sum, weight) => sum + weight, 0);
    return queryWeights.map(weight => (weight / totalWeight) * totalEpsilon);
  }

  /**
   * Check if query result satisfies privacy requirements
   */
  validatePrivacyResult(result: DifferentialPrivacyResult, minEpsilon: number = 0.1): boolean {
    return result.epsilon >= minEpsilon && result.isReliable;
  }

  /**
   * Calculate privacy budget consumption for complex queries
   */
  calculateBudgetConsumption(queryType: string, epsilon: number, dataSize?: number): number {
    // Base consumption is the epsilon value
    let consumption = epsilon;

    // Adjust for query complexity
    switch (queryType) {
      case 'cohort_analysis':
        consumption *= 1.5; // More complex queries consume more budget
        break;
      case 'funnel_analysis':
        consumption *= 1.3;
        break;
      case 'retention_analysis':
        consumption *= 1.4;
        break;
      case 'aggregate_count':
      case 'aggregate_sum':
      case 'aggregate_average':
        consumption *= 1.0; // Simple queries
        break;
    }

    // Adjust for data size (larger datasets provide more privacy)
    if (dataSize && dataSize > 1000) {
      consumption *= Math.sqrt(1000 / dataSize);
    }

    return Math.min(consumption, 1.0); // Cap at 1.0
  }

  private generateLaplaceNoise(mean: number, scale: number): number {
    const u = Math.random() - 0.5;
    return mean - scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  private generateGaussianNoise(mean: number, sigma: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sigma * z0;
  }

  private calculateGaussianSigma(epsilon: number, delta: number, sensitivity: number): number {
    // Using the standard Gaussian mechanism formula
    return (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
  }

  private calculateConfidenceInterval(value: number, scale: number, confidence: number): [number, number] {
    const zScore = this.getZScore(confidence);
    const margin = zScore * scale;
    return [value - margin, value + margin];
  }

  private getZScore(confidence: number): number {
    // Approximate z-scores for common confidence levels
    const zScores: { [key: number]: number } = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576,
    };
    return zScores[confidence] || 1.96;
  }

  /**
   * Estimate data bounds from sample data for clipping
   */
  estimateBounds(data: number[], percentile: number = 0.95): [number, number] {
    if (data.length === 0) {
      return [0, 1];
    }

    const sorted = [...data].sort((a, b) => a - b);
    const lowerIndex = Math.floor((1 - percentile) / 2 * sorted.length);
    const upperIndex = Math.ceil((1 + percentile) / 2 * sorted.length) - 1;
    
    return [sorted[lowerIndex], sorted[upperIndex]];
  }

  /**
   * Apply data clipping to reduce sensitivity
   */
  clipData(data: number[], bounds: [number, number]): number[] {
    return data.map(value => Math.max(bounds[0], Math.min(bounds[1], value)));
  }
}
