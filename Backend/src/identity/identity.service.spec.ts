import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './mock-notification.service';
import { IdentityProvider, IdentityStatus, PrivacyLevel, VerificationMethod } from '@prisma/client';

describe('IdentityService', () => {
  let service: IdentityService;
  let prismaService: PrismaService;
  let notificationService: NotificationService;

  const mockPrismaService = {
    linkedIdentity: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    identityVerificationChallenge: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    identitySecurityAlert: {
      create: jest.fn(),
    },
  };

  const mockNotificationService = {
    sendNotification: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<IdentityService>(IdentityService);
    prismaService = module.get<PrismaService>(PrismaService);
    notificationService = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('linkIdentity', () => {
    it('should successfully link a new identity', async () => {
      const userId = 'user123';
      const linkData = {
        provider: IdentityProvider.GOOGLE,
        providerId: 'google123',
        providerEmail: 'test@example.com',
        privacyLevel: PrivacyLevel.PRIVATE,
      };

      const expectedIdentity = {
        id: 'identity123',
        userId,
        provider: IdentityProvider.GOOGLE,
        providerId: 'google123',
        providerEmail: 'test@example.com',
        status: IdentityStatus.PENDING_VERIFICATION,
        isPrimary: false,
        isVerified: false,
        privacyLevel: PrivacyLevel.PRIVATE,
      };

      mockPrismaService.linkedIdentity.findFirst.mockResolvedValue(null);
      mockPrismaService.linkedIdentity.create.mockResolvedValue(expectedIdentity);

      const result = await service.linkIdentity(userId, linkData);

      expect(result).toEqual(expectedIdentity);
      expect(mockPrismaService.linkedIdentity.create).toHaveBeenCalledWith({
        data: {
          userId,
          provider: IdentityProvider.GOOGLE,
          providerId: 'google123',
          providerEmail: 'test@example.com',
          privacyLevel: PrivacyLevel.PRIVATE,
          status: IdentityStatus.PENDING_VERIFICATION,
          isPrimary: false,
          providerData: undefined,
          providerUsername: undefined,
        },
      });
      expect(notificationService.sendNotification).toHaveBeenCalled();
    });

    it('should throw ConflictException if identity already exists', async () => {
      const userId = 'user123';
      const linkData = {
        provider: IdentityProvider.GOOGLE,
        providerId: 'google123',
      };

      mockPrismaService.linkedIdentity.findFirst.mockResolvedValue({} as any);

      await expect(service.linkIdentity(userId, linkData)).rejects.toThrow(ConflictException);
    });
  });

  describe('createVerificationChallenge', () => {
    it('should create an email verification challenge', async () => {
      const userId = 'user123';
      const identityId = 'identity123';
      const challengeData = {
        method: VerificationMethod.EMAIL_CODE,
        expiresIn: 15,
      };

      const identity = {
        id: identityId,
        userId,
        isVerified: false,
      };

      const expectedChallenge = {
        id: 'challenge123',
        linkedIdentityId: identityId,
        method: VerificationMethod.EMAIL_CODE,
        challenge: '123456',
        expiresAt: expect.any(Date),
      };

      mockPrismaService.linkedIdentity.findFirst.mockResolvedValue(identity as any);
      mockPrismaService.identityVerificationChallenge.create.mockResolvedValue(expectedChallenge as any);

      const result = await service.createVerificationChallenge(userId, identityId, challengeData);

      expect(result).toEqual(expectedChallenge);
      expect(mockPrismaService.identityVerificationChallenge.create).toHaveBeenCalledWith({
        data: {
          linkedIdentityId: identityId,
          method: VerificationMethod.EMAIL_CODE,
          challenge: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should throw BadRequestException if identity is already verified', async () => {
      const userId = 'user123';
      const identityId = 'identity123';

      const identity = {
        id: identityId,
        userId,
        isVerified: true,
      };

      mockPrismaService.linkedIdentity.findFirst.mockResolvedValue(identity as any);

      await expect(service.createVerificationChallenge(userId, identityId, { method: VerificationMethod.EMAIL_CODE }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserIdentities', () => {
    it('should return all user identities', async () => {
      const userId = 'user123';
      const identities = [
        { id: 'identity1', isPrimary: true },
        { id: 'identity2', isPrimary: false },
      ];

      mockPrismaService.linkedIdentity.findMany.mockResolvedValue(identities as any);

      const result = await service.getUserIdentities(userId);

      expect(result).toEqual(identities);
      expect(mockPrismaService.linkedIdentity.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: [
          { isPrimary: 'desc' },
          { createdAt: 'desc' },
        ],
      });
    });
  });
});
