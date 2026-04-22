import { Test, TestingModule } from '@nestjs/testing';
import { DifferentialPrivacyService } from './differential-privacy.service';

describe('DifferentialPrivacyService', () => {
  let service: DifferentialPrivacyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DifferentialPrivacyService],
    }).compile();

    service = module.get<DifferentialPrivacyService>(DifferentialPrivacyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addLaplaceNoise', () => {
    it('should add Laplace noise to a value', () => {
      const result = service.addLaplaceNoise(100, 0.5, 1);
      
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('noiseAdded');
      expect(result).toHaveProperty('epsilon', 0.5);
      expect(result).toHaveProperty('isReliable');
      expect(typeof result.value).toBe('number');
      expect(typeof result.noiseAdded).toBe('number');
    });

    it('should throw error for invalid epsilon', () => {
      expect(() => service.addLaplaceNoise(100, 0, 1)).toThrow('Epsilon must be positive');
      expect(() => service.addLaplaceNoise(100, -0.1, 1)).toThrow('Epsilon must be positive');
    });

    it('should provide confidence interval', () => {
      const result = service.addLaplaceNoise(100, 0.5, 1);
      
      expect(result.confidenceInterval).toBeDefined();
      expect(Array.isArray(result.confidenceInterval)).toBe(true);
      expect(result.confidenceInterval).toHaveLength(2);
    });
  });

  describe('addGaussianNoise', () => {
    it('should add Gaussian noise to a value', () => {
      const result = service.addGaussianNoise(100, 0.5, 1e-5, 1);
      
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('noiseAdded');
      expect(result).toHaveProperty('epsilon', 0.5);
      expect(result).toHaveProperty('isReliable');
    });

    it('should throw error for invalid parameters', () => {
      expect(() => service.addGaussianNoise(100, 0, 1e-5, 1)).toThrow('Invalid epsilon or delta parameters');
      expect(() => service.addGaussianNoise(100, 0.5, 0, 1)).toThrow('Invalid epsilon or delta parameters');
      expect(() => service.addGaussianNoise(100, 0.5, 1, 1)).toThrow('Invalid epsilon or delta parameters');
    });
  });

  describe('privateCount', () => {
    it('should apply differential privacy to count', () => {
      const result = service.privateCount(100, 0.5);
      
      expect(result.value).not.toBe(100); // Should be different due to noise
      expect(result.epsilon).toBe(0.5);
      expect(result.isReliable).toBeDefined();
    });
  });

  describe('privateSum', () => {
    it('should apply differential privacy to sum', () => {
      const result = service.privateSum(1000, 0.5, [0, 100]);
      
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('epsilon', 0.5);
      expect(result.isReliable).toBeDefined();
    });
  });

  describe('privateAverage', () => {
    it('should apply differential privacy to average', () => {
      const result = service.privateAverage(50, 100, 0.5, [0, 100]);
      
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('epsilon', 0.5);
      expect(result.isReliable).toBeDefined();
    });

    it('should handle zero count gracefully', () => {
      const result = service.privateAverage(50, 0, 0.5, [0, 100]);
      
      expect(result.value).toBe(0);
      expect(result.isReliable).toBe(false);
    });
  });

  describe('optimizeEpsilonAllocation', () => {
    it('should distribute epsilon based on weights', () => {
      const weights = [1, 2, 3];
      const totalEpsilon = 1.0;
      const allocation = service.optimizeEpsilonAllocation(totalEpsilon, weights);
      
      expect(allocation).toHaveLength(3);
      expect(allocation.reduce((sum, val) => sum + val, 0)).toBeCloseTo(totalEpsilon);
      expect(allocation[1]).toBe(allocation[0] * 2);
      expect(allocation[2]).toBe(allocation[0] * 3);
    });
  });

  describe('estimateBounds', () => {
    it('should estimate reasonable bounds from data', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const bounds = service.estimateBounds(data, 0.8);
      
      expect(bounds).toHaveLength(2);
      expect(bounds[0]).toBeLessThan(bounds[1]);
      expect(bounds[0]).toBeGreaterThanOrEqual(1);
      expect(bounds[1]).toBeLessThanOrEqual(10);
    });

    it('should handle empty data', () => {
      const bounds = service.estimateBounds([], 0.95);
      
      expect(bounds).toEqual([0, 1]);
    });
  });

  describe('clipData', () => {
    it('should clip data to specified bounds', () => {
      const data = [1, 2, 3, 4, 5];
      const bounds: [number, number] = [2, 4];
      const clipped = service.clipData(data, bounds);
      
      expect(clipped).toEqual([2, 2, 3, 4, 4]);
    });
  });

  describe('calculateBudgetConsumption', () => {
    it('should calculate budget consumption for different query types', () => {
      const cohortConsumption = service.calculateBudgetConsumption('cohort_analysis', 0.5, 1000);
      const simpleConsumption = service.calculateBudgetConsumption('aggregate_count', 0.5, 1000);
      
      expect(cohortConsumption).toBeGreaterThan(simpleConsumption);
      expect(cohortConsumption).toBeLessThanOrEqual(1.0);
    });

    it('should adjust for data size', () => {
      const smallDataConsumption = service.calculateBudgetConsumption('aggregate_count', 0.5, 100);
      const largeDataConsumption = service.calculateBudgetConsumption('aggregate_count', 0.5, 10000);
      
      expect(largeDataConsumption).toBeLessThan(smallDataConsumption);
    });
  });
});
