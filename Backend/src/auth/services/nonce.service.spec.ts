import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NonceService } from './nonce.service';
import { LoginNonce } from '../entities/login-nonce.entity';
import { UnauthorizedException } from '@nestjs/common';

describe('NonceService', () => {
  let service: NonceService;
  let repository: Repository<LoginNonce>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NonceService,
        {
          provide: getRepositoryToken(LoginNonce),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<NonceService>(NonceService);
    repository = module.get<Repository<LoginNonce>>(
      getRepositoryToken(LoginNonce),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateNonce', () => {
    it('should generate a nonce successfully', async () => {
      const publicKey = 'GABC123TEST';
      const mockNonce = {
        id: '1',
        nonce: 'test-nonce-uuid',
        publicKey,
        expiresAt: new Date(),
        used: false,
        createdAt: new Date(),
      };

      mockRepository.create.mockReturnValue(mockNonce);
      mockRepository.save.mockResolvedValue(mockNonce);

      const result = await service.generateNonce(publicKey);

      expect(result).toHaveProperty('nonce');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('Sign this message');
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should set expiration 5 minutes in the future', async () => {
      const publicKey = 'GABC123TEST';
      const beforeTime = new Date();

      mockRepository.create.mockImplementation((data) => data);
      mockRepository.save.mockImplementation((data) => Promise.resolve(data));

      const result = await service.generateNonce(publicKey);
      const afterTime = new Date();

      // Expiration should be approximately 5 minutes from now
      // Allow for test execution time by checking it's between 4.9 and 5.1 minutes
      const minExpiration = new Date(beforeTime.getTime() + 4.9 * 60 * 1000);
      const maxExpiration = new Date(afterTime.getTime() + 5.1 * 60 * 1000);

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(minExpiration.getTime());
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(maxExpiration.getTime());
    });
  });

  describe('validateNonce', () => {
    it('should validate a valid nonce', async () => {
      const nonce = 'valid-nonce';
      const publicKey = 'GABC123TEST';
      const mockNonce = {
        id: '1',
        nonce,
        publicKey,
        expiresAt: new Date(Date.now() + 300000),
        used: false,
        createdAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockNonce);

      const result = await service.validateNonce(nonce, publicKey);

      expect(result).toEqual(mockNonce);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { nonce, publicKey },
      });
    });

    it('should throw error if nonce not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.validateNonce('invalid-nonce', 'GABC123TEST'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error if nonce already used', async () => {
      const mockNonce = {
        id: '1',
        nonce: 'used-nonce',
        publicKey: 'GABC123TEST',
        expiresAt: new Date(Date.now() + 300000),
        used: true,
        createdAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockNonce);

      await expect(
        service.validateNonce('used-nonce', 'GABC123TEST'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error if nonce expired', async () => {
      const mockNonce = {
        id: '1',
        nonce: 'expired-nonce',
        publicKey: 'GABC123TEST',
        expiresAt: new Date(Date.now() - 1000),
        used: false,
        createdAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockNonce);

      await expect(
        service.validateNonce('expired-nonce', 'GABC123TEST'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('markNonceUsed', () => {
    it('should mark nonce as used', async () => {
      const nonce = 'test-nonce';
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.markNonceUsed(nonce);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { nonce },
        { used: true },
      );
    });
  });

  describe('cleanupExpiredNonces', () => {
    it('should delete expired nonces', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 5 });

      await service.cleanupExpiredNonces();

      expect(mockRepository.delete).toHaveBeenCalled();
    });
  });
});
