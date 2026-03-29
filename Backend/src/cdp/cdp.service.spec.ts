import { Test, TestingModule } from '@nestjs/testing';
import { CdpService } from './cdp.service';
import { EventIngestionService } from './services/event-ingestion.service';
import { IdentityResolutionService } from './services/identity-resolution.service';
import { SegmentBuilderService } from './services/segment-builder.service';
import { UserProfileService } from './services/user-profile.service';
import { ConsentTrackingService } from './services/consent-tracking.service';
import { RealtimeService } from './services/realtime.service';
import { IntegrationService } from './services/integration.service';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventIngestionDto, SegmentCreateDto, ConsentUpdateDto } from './dto/cdp.dto';

describe('CdpService', () => {
  let service: CdpService;
  let eventIngestionService: EventIngestionService;
  let identityResolutionService: IdentityResolutionService;
  let segmentBuilderService: SegmentBuilderService;
  let userProfileService: UserProfileService;
  let consentTrackingService: ConsentTrackingService;
  let realtimeService: RealtimeService;
  let integrationService: IntegrationService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockRedisService = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    publish: jest.fn(),
    subscribe: jest.fn(),
    lpush: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CdpService,
        {
          provide: EventIngestionService,
          useValue: {
            processEvent: jest.fn(),
          },
        },
        {
          provide: IdentityResolutionService,
          useValue: {
            resolveIdentity: jest.fn(),
            resolveAnonymousIdentity: jest.fn(),
          },
        },
        {
          provide: SegmentBuilderService,
          useValue: {
            listSegments: jest.fn(),
            createSegment: jest.fn(),
            getSegmentUsers: jest.fn(),
            evaluateSegment: jest.fn(),
            getUserSegments: jest.fn(),
            updateSegmentMemberships: jest.fn(),
          },
        },
        {
          provide: UserProfileService,
          useValue: {
            getUnifiedProfile: jest.fn(),
            updateProfileFromEvent: jest.fn(),
          },
        },
        {
          provide: ConsentTrackingService,
          useValue: {
            updateConsent: jest.fn(),
            getUserConsent: jest.fn(),
          },
        },
        {
          provide: RealtimeService,
          useValue: {
            broadcastEventUpdate: jest.fn(),
            broadcastSegmentUpdates: jest.fn(),
          },
        },
        {
          provide: IntegrationService,
          useValue: {
            activateSegment: jest.fn(),
            notifyConsentChange: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<CdpService>(CdpService);
    eventIngestionService = module.get<EventIngestionService>(EventIngestionService);
    identityResolutionService = module.get<IdentityResolutionService>(IdentityResolutionService);
    segmentBuilderService = module.get<SegmentBuilderService>(SegmentBuilderService);
    userProfileService = module.get<UserProfileService>(UserProfileService);
    consentTrackingService = module.get<ConsentTrackingService>(ConsentTrackingService);
    realtimeService = module.get<RealtimeService>(RealtimeService);
    integrationService = module.get<IntegrationService>(IntegrationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ingestEvent', () => {
    it('should process event with resolved identity', async () => {
      const eventDto: EventIngestionDto = {
        anonymousId: 'anon_123',
        type: 'PAGE_VIEW' as any,
        source: 'WEB' as any,
        eventName: 'homepage_visit',
        properties: { page: '/home' },
      };

      const resolvedIdentity = {
        userId: 'user_123',
        anonymousId: 'anon_123',
        isNewUser: false,
        confidence: 0.9,
      };

      const processedEvent = {
        id: 'event_123',
        userId: 'user_123',
        anonymousId: 'anon_123',
        type: 'PAGE_VIEW' as any,
        source: 'WEB' as any,
        eventName: 'homepage_visit',
        properties: { page: '/home' },
        timestamp: new Date(),
        processedAt: new Date(),
      };

      jest.spyOn(identityResolutionService, 'resolveIdentity').mockResolvedValue(resolvedIdentity);
      jest.spyOn(eventIngestionService, 'processEvent').mockResolvedValue(processedEvent);
      jest.spyOn(userProfileService, 'updateProfileFromEvent').mockResolvedValue(undefined);
      jest.spyOn(segmentBuilderService, 'updateSegmentMemberships').mockResolvedValue(undefined);
      jest.spyOn(realtimeService, 'broadcastEventUpdate').mockResolvedValue(undefined);

      const result = await service.ingestEvent(eventDto);

      expect(identityResolutionService.resolveIdentity).toHaveBeenCalledWith('anon_123', undefined, undefined);
      expect(eventIngestionService.processEvent).toHaveBeenCalledWith({
        ...eventDto,
        userId: 'user_123',
        anonymousId: 'anon_123',
      });
      expect(userProfileService.updateProfileFromEvent).toHaveBeenCalledWith(processedEvent);
      expect(segmentBuilderService.updateSegmentMemberships).toHaveBeenCalledWith('user_123');
      expect(realtimeService.broadcastEventUpdate).toHaveBeenCalledWith(processedEvent);
      expect(result).toEqual({ eventId: 'event_123', status: 'processed' });
    });
  });

  describe('getUserProfile', () => {
    it('should return unified user profile with segments', async () => {
      const userId = 'user_123';
      const mockProfile = {
        id: 'user_123',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        walletAddress: '0x1234567890123456789012345678901234567890',
        profileData: { name: 'Test User' },
        eventCount: 100,
        lastActivity: new Date(),
        firstSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSegments = [
        {
          id: 'segment_1',
          name: 'Active Users',
          type: 'BEHAVIORAL',
          joinedAt: new Date(),
        },
      ];

      const mockConsent = {
        MARKETING: true,
        ANALYTICS: true,
        PERSONALIZATION: false,
        ESSENTIAL: true,
      };

      jest.spyOn(userProfileService, 'getUnifiedProfile').mockResolvedValue(mockProfile);
      jest.spyOn(segmentBuilderService, 'getUserSegments').mockResolvedValue(mockSegments);
      jest.spyOn(consentTrackingService, 'getUserConsent').mockResolvedValue(mockConsent);

      const result = await service.getUserProfile(userId);

      expect(userProfileService.getUnifiedProfile).toHaveBeenCalledWith(userId);
      expect(segmentBuilderService.getUserSegments).toHaveBeenCalledWith(userId);
      expect(consentTrackingService.getUserConsent).toHaveBeenCalledWith(userId);
      expect(result).toEqual({
        userId: 'user_123',
        email: 'test@example.com',
        phone: '+1234567890',
        walletAddress: '0x1234567890123456789012345678901234567890',
        profileData: { name: 'Test User' },
        segments: [
          {
            id: 'segment_1',
            name: 'Active Users',
            type: 'BEHAVIORAL',
            joinedAt: mockSegments[0].joinedAt.toISOString(),
          },
        ],
        consent: mockConsent,
        eventCount: 100,
        lastActivity: mockProfile.lastActivity.toISOString(),
        createdAt: mockProfile.createdAt.toISOString(),
        updatedAt: mockProfile.updatedAt.toISOString(),
      });
    });
  });

  describe('createSegment', () => {
    it('should create and evaluate new segment', async () => {
      const segmentDto: SegmentCreateDto = {
        name: 'Test Segment',
        type: 'VISUAL' as any,
        conditions: [
          {
            field: 'eventCount',
            operator: 'greater_than',
            value: 10,
          },
        ],
      };

      const mockSegment = {
        id: 'segment_123',
        name: 'Test Segment',
        type: 'VISUAL',
        userCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockEvaluationResult = {
        segmentId: 'segment_123',
        totalUsers: 50,
        addedUsers: ['user_1', 'user_2'],
        removedUsers: [],
        updates: [
          {
            userId: 'user_1',
            segmentId: 'segment_123',
            action: 'added' as const,
          },
        ],
      };

      jest.spyOn(segmentBuilderService, 'createSegment').mockResolvedValue(mockSegment);
      jest.spyOn(segmentBuilderService, 'evaluateSegment').mockResolvedValue(mockEvaluationResult);

      const result = await service.createSegment(segmentDto);

      expect(segmentBuilderService.createSegment).toHaveBeenCalledWith(segmentDto);
      expect(segmentBuilderService.evaluateSegment).toHaveBeenCalledWith('segment_123');
      expect(result).toEqual(mockSegment);
    });
  });

  describe('updateConsent', () => {
    it('should update user consent and trigger re-evaluation', async () => {
      const userId = 'user_123';
      const consentDto: ConsentUpdateDto = {
        type: 'MARKETING' as any,
        granted: true,
        channel: 'email',
      };

      const mockConsent = {
        id: 'consent_123',
        userId: 'user_123',
        type: 'MARKETING' as any,
        granted: true,
        channel: 'email',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(consentTrackingService, 'updateConsent').mockResolvedValue(mockConsent);
      jest.spyOn(segmentBuilderService, 'updateSegmentMemberships').mockResolvedValue(undefined);
      jest.spyOn(integrationService, 'notifyConsentChange').mockResolvedValue(undefined);

      const result = await service.updateConsent(userId, consentDto);

      expect(consentTrackingService.updateConsent).toHaveBeenCalledWith(userId, consentDto);
      expect(segmentBuilderService.updateSegmentMemberships).toHaveBeenCalledWith(userId);
      expect(integrationService.notifyConsentChange).toHaveBeenCalledWith(userId, mockConsent);
      expect(result).toEqual(mockConsent);
    });
  });

  describe('activateSegment', () => {
    it('should activate segment for multiple integrations', async () => {
      const segmentId = 'segment_123';
      const integrations = ['sendgrid', 'onesignal'];
      const mockUsers = [
        { id: 'user_1', email: 'user1@example.com' },
        { id: 'user_2', email: 'user2@example.com' },
      ];

      const mockActivationResults = [
        {
          integration: 'sendgrid',
          status: 'success' as const,
          message: 'Successfully activated segment for 2 users',
          activatedUsers: 2,
          failedUsers: 0,
        },
        {
          integration: 'onesignal',
          status: 'success' as const,
          message: 'Successfully activated segment for 2 users',
          activatedUsers: 2,
          failedUsers: 0,
        },
      ];

      jest.spyOn(segmentBuilderService, 'getSegmentUsers').mockResolvedValue({
        users: mockUsers,
        total: 2,
        limit: 10000,
        offset: 0,
      });

      jest.spyOn(integrationService, 'activateSegment')
        .mockResolvedValueOnce(mockActivationResults[0])
        .mockResolvedValueOnce(mockActivationResults[1]);

      const result = await service.activateSegment(segmentId, integrations);

      expect(segmentBuilderService.getSegmentUsers).toHaveBeenCalledWith(segmentId, 10000, 0);
      expect(integrationService.activateSegment).toHaveBeenCalledTimes(2);
      expect(integrationService.activateSegment).toHaveBeenCalledWith(segmentId, 'sendgrid', mockUsers);
      expect(integrationService.activateSegment).toHaveBeenCalledWith(segmentId, 'onesignal', mockUsers);
      expect(result).toEqual({
        segmentId,
        integrations: [
          {
            integration: 'sendgrid',
            status: 'success',
            message: 'Successfully activated segment for 2 users',
          },
          {
            integration: 'onesignal',
            status: 'success',
            message: 'Successfully activated segment for 2 users',
          },
        ],
      });
    });
  });
});
