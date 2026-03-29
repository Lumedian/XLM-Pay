import { EventIngestionDto, SegmentCreateDto, UserProfileDto, ConsentUpdateDto } from '../dto/cdp.dto';

export interface CdpService {
  ingestEvent(eventDto: EventIngestionDto): Promise<any>;
  getUserProfile(userId: string): Promise<UserProfileDto>;
  listSegments(tenantId?: string): Promise<any>;
  createSegment(segmentDto: SegmentCreateDto): Promise<any>;
  getSegmentUsers(segmentId: string, limit: number, offset: number): Promise<any>;
  evaluateSegment(segmentId: string): Promise<any>;
  updateConsent(userId: string, consentDto: ConsentUpdateDto): Promise<any>;
  getConsent(userId: string): Promise<any>;
  activateSegment(segmentId: string, integrations: string[]): Promise<any>;
  resolveAnonymousIdentity(anonymousId: string): Promise<any>;
}
