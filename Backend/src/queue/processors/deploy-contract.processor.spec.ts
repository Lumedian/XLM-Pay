import { Test, TestingModule } from '@nestjs/testing';
import { DeployContractProcessor } from './deploy-contract.processor';

describe('DeployContractProcessor', () => {
  let processor: DeployContractProcessor;

  const createMockJob = (
    overrides: Partial<{
      contractName: string;
      contractCode: string;
      network: string;
      initializer?: string;
    }> = {},
  ) => ({
    id: '123',
    data: {
      contractName: 'TestContract',
      contractCode: 'contract code here',
      network: 'testnet',
      initializer: 'init-func',
      ...overrides,
    },
    progress: jest.fn(),
    log: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeployContractProcessor],
    }).compile();

    processor = module.get<DeployContractProcessor>(DeployContractProcessor);
  });

  describe('handleDeployContract', () => {
    it('should successfully deploy contract', async () => {
      const job = createMockJob();
      const result = await processor.handleDeployContract(job as any);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('contractAddress');
      expect(result.data).toHaveProperty('transactionHash');
      expect(result.data).toHaveProperty('deployedAt');
    });

    it('should update progress', async () => {
      const job = createMockJob();
      await processor.handleDeployContract(job as any);

      expect(job.progress).toHaveBeenCalledWith(10);
      expect(job.progress).toHaveBeenCalledWith(30);
      expect(job.progress).toHaveBeenCalledWith(50);
      expect(job.progress).toHaveBeenCalledWith(90);
      expect(job.progress).toHaveBeenCalledWith(100);
    });

    it('should throw error if required fields missing', async () => {
      const job = createMockJob({
        contractName: '',
        contractCode: 'code',
        network: 'testnet',
        initializer: 'init',
      });

      await expect(processor.handleDeployContract(job as any)).rejects.toThrow(
        'Missing required fields',
      );
    });

    it('should throw error if contract code is empty', async () => {
      const job = createMockJob({
        contractName: 'TestContract',
        contractCode: '',
        network: 'testnet',
        initializer: 'init-func',
      });

      await expect(
        processor.handleDeployContract(job as any),
      ).rejects.toThrow();
    });

    it('should include network in result', async () => {
      const job = createMockJob();
      const result = await processor.handleDeployContract(job as any);

      expect(result.data.network).toBe('testnet');
    });

    it('should include contract name in result', async () => {
      const job = createMockJob();
      const result = await processor.handleDeployContract(job as any);

      expect(result.data.contractName).toBe('TestContract');
    });
  });
});
