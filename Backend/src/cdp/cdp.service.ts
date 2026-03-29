import { Injectable, Logger } from '@nestjs/common';
import { CdpService as ICdpService } from './interfaces/cdp-service.interface';
import { EventIngestionService } from './services/event-ingestion.service';
import { IdentityResolutionService } from './services/identity-resolution.service';
import { SegmentBuilderService } from './services/segment-builder.service';
import { UserProfileService } from './services/user-profile.service';
import { ConsentTrackingService } from './services/consent-tracking.service';
import { RealtimeService } from './services/realtime.service';
import { IntegrationService } from './services/integration.service';
import {
  EventIngestionDto,
  SegmentCreateDto,
  UserProfileDto,
  ConsentUpdateDto,
} from './dto/cdp.dto';

@Injectable()
export class CdpService implements ICdpService {
  private readonly logger = new Logger(CdpService.name);

  constructor(
    private readonly eventIngestionService: EventIngestionService,
    private readonly identityResolutionService: IdentityResolutionService,
    private readonly segmentBuilderService: SegmentBuilderService,
    private readonly userProfileService: UserProfileService,
    private readonly consentTrackingService: ConsentTrackingService,
    private readonly realtimeService: RealtimeService,
    private readonly integrationService: IntegrationService,
  ) {}

  async ingestEvent(eventDto: EventIngestionDto) {
    this.logger.log(`Ingesting event: ${eventDto.eventName} from ${eventDto.source}`);
    
    // Process identity resolution first
    const resolvedIdentity = await this.identityResolutionService.resolveIdentity(
      eventDto.anonymousId,
      eventDto.userId,
      eventDto.tenantId,
    );

    // Store the event with resolved identity
    const processedEvent = await this.eventIngestionService.processEvent({
      ...eventDto,
      userId: resolvedIdentity.userId,
      anonymousId: resolvedIdentity.anonymousId,
    });

    // Update user profile in real-time
    await this.userProfileService.updateProfileFromEvent(processedEvent);

    // Check and update segment memberships
    await this.segmentBuilderService.updateSegmentMemberships(resolvedIdentity.userId);

    // Trigger real-time updates if needed
    await this.realtimeService.broadcastEventUpdate(processedEvent);

    return { eventId: processedEvent.id, status: 'processed' };
  }

  async getUserProfile(userId: string): Promise<UserProfileDto> {
    this.logger.log(`Fetching user profile for: ${userId}`);
    
    const profile = await this.userProfileService.getUnifiedProfile(userId);
    const segments = await this.segmentBuilderService.getUserSegments(userId);
    const consent = await this.consentTrackingService.getUserConsent(userId);

    return {
      userId: profile.id,
      email: profile.email,
      phone: profile.phoneNumber,
      walletAddress: profile.walletAddress,
      profileData: profile.profileData || {},
      segments: segments.map(seg => ({
        id: seg.id,
        name: seg.name,
        type: seg.type,
        joinedAt: seg.joinedAt.toISOString(),
      })),
      consent,
      eventCount: profile.eventCount || 0,
      lastActivity: profile.lastActivity?.toISOString() || profile.createdAt.toISOString(),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  async listSegments(tenantId?: string) {
    return this.segmentBuilderService.listSegments(tenantId);
  }

  async createSegment(segmentDto: SegmentCreateDto) {
    this.logger.log(`Creating segment: ${segmentDto.name}`);
    
    const segment = await this.segmentBuilderService.createSegment(segmentDto);
    
    // Evaluate initial membership
    await this.segmentBuilderService.evaluateSegment(segment.id);
    
    return segment;
  }

  async getSegmentUsers(segmentId: string, limit: number, offset: number) {
    return this.segmentBuilderService.getSegmentUsers(segmentId, limit, offset);
  }

  async evaluateSegment(segmentId: string) {
    this.logger.log(`Evaluating segment: ${segmentId}`);
    
    const result = await this.segmentBuilderService.evaluateSegment(segmentId);
    
    // Trigger real-time updates for affected users
    if (result.updates.length > 0) {
      await this.realtimeService.broadcastSegmentUpdates(result.updates);
    }
    
    return result;
  }

  async updateConsent(userId: string, consentDto: ConsentUpdateDto) {
    this.logger.log(`Updating consent for user: ${userId}, type: ${consentDto.type}`);
    
    const consent = await this.consentTrackingService.updateConsent(userId, consentDto);
    
    // Update segment memberships based on consent changes
    await this.segmentBuilderService.updateSegmentMemberships(userId);
    
    // Notify integrations about consent changes
    await this.integrationService.notifyConsentChange(userId, consent);
    
    return consent;
  }

  async getConsent(userId: string) {
    return this.consentTrackingService.getUserConsent(userId);
  }

  async activateSegment(segmentId: string, integrations: string[]) {
    this.logger.log(`Activating segment ${segmentId} for integrations: ${integrations.join(', ')}`);
    
    // Get segment users
    const users = await this.segmentBuilderService.getSegmentUsers(segmentId, 10000, 0);
    
    // Activate for each integration
    const results = await Promise.allSettled(
      integrations.map(integration => 
        this.integrationService.activateSegment(segmentId, integration, users)
      )
    );
    
    return {
      segmentId,
      integrations: integrations.map((integration, index) => ({
        integration,
        status: results[index].status === 'fulfilled' ? 'success' : 'failed',
        message: results[index].status === 'fulfilled' 
          ? 'Activated successfully' 
          : (results[index] as PromiseRejectedResult).reason.message,
      })),
    };
  }

  async resolveAnonymousIdentity(anonymousId: string) {
    this.logger.log(`Resolving anonymous identity: ${anonymousId}`);
    
    return this.identityResolutionService.resolveAnonymousIdentity(anonymousId);
  }
}
