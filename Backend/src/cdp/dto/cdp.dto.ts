import { IsString, IsObject, IsOptional, IsEnum, IsArray, IsBoolean, IsNumber } from 'class-validator';

export enum EventType {
  PAGE_VIEW = 'page_view',
  CLICK = 'click',
  FORM_SUBMIT = 'form_submit',
  PURCHASE = 'purchase',
  LOGIN = 'login',
  SIGNUP = 'signup',
  CUSTOM = 'custom',
}

export enum EventSource {
  WEB = 'web',
  MOBILE = 'mobile',
  BACKEND = 'backend',
}

export enum ConsentType {
  MARKETING = 'marketing',
  ANALYTICS = 'analytics',
  PERSONALIZATION = 'personalization',
  ESSENTIAL = 'essential',
}

export enum SegmentType {
  SQL = 'sql',
  VISUAL = 'visual',
  BEHAVIORAL = 'behavioral',
  DEMOGRAPHIC = 'demographic',
}

export class EventIngestionDto {
  @IsString()
  anonymousId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsEnum(EventType)
  type: EventType;

  @IsEnum(EventSource)
  source: EventSource;

  @IsString()
  eventName: string;

  @IsObject()
  properties: Record<string, any>;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;

  @IsString()
  @IsOptional()
  referrer?: string;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsNumber()
  @IsOptional()
  timestamp?: number;
}

export class SegmentCreateDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(SegmentType)
  type: SegmentType;

  @IsString()
  @IsOptional()
  sqlQuery?: string;

  @IsObject()
  @IsOptional()
  visualConfig?: Record<string, any>;

  @IsArray()
  @IsOptional()
  conditions?: Array<{
    field: string;
    operator: string;
    value: any;
    logicalOperator?: 'AND' | 'OR';
  }>;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class SegmentQueryDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(SegmentType)
  @IsOptional()
  type?: SegmentType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ConsentUpdateDto {
  @IsEnum(ConsentType)
  type: ConsentType;

  @IsBoolean()
  granted: boolean;

  @IsString()
  @IsOptional()
  channel?: string;

  @IsString()
  @IsOptional()
  purpose?: string;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;
}

export class UserProfileDto {
  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  walletAddress?: string;

  @IsObject()
  profileData: Record<string, any>;

  @IsArray()
  segments: Array<{
    id: string;
    name: string;
    type: string;
    joinedAt: string;
  }>;

  @IsObject()
  consent: Record<ConsentType, boolean>;

  @IsNumber()
  eventCount: number;

  @IsString()
  lastActivity: string;

  @IsString()
  createdAt: string;

  @IsString()
  updatedAt: string;
}

export class SegmentMembershipDto {
  @IsString()
  segmentId: string;

  @IsString()
  userId: string;

  @IsBoolean()
  isActive: boolean;

  @IsString()
  joinedAt: string;

  @IsString()
  @IsOptional()
  leftAt?: string;
}
