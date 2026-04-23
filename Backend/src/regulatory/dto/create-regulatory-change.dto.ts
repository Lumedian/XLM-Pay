import { IsString, IsEnum, IsDate, IsArray, IsOptional, IsNumber, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RegulatorySource, ChangeType, ComplianceArea, TaskStatus, TaskPriority } from '../interfaces/regulatory.interface';

export class CreateRegulatoryChangeDto {
  @IsString()
  title: string;

  @IsString()
  summary: string;

  @IsString()
  content: string;

  @IsEnum(RegulatorySource)
  source: RegulatorySource;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @IsEnum(ChangeType)
  changeType: ChangeType;

  @IsDate()
  @Type(() => Date)
  publicationDate: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  effectiveDate?: Date;

  @IsArray()
  @IsString({ each: true })
  jurisdictions: string[];

  @IsArray()
  @IsEnum(ComplianceArea, { each: true })
  complianceAreas: ComplianceArea[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aiTags?: string[];
}

export class CreateImpactAssessmentDto {
  @IsString()
  regulatoryChangeId: string;

  @IsString()
  assessorId: string;

  @IsString()
  assessorName: string;

  @IsEnum(ComplianceArea)
  complianceArea: ComplianceArea;

  @IsEnum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'])
  impactLevel: string;

  @IsString()
  impactSummary: string;

  @IsArray()
  @IsString({ each: true })
  affectedOperations: string[];

  @IsArray()
  @IsString({ each: true })
  requiredActions: string[];

  @IsOptional()
  @IsNumber()
  estimatedCost?: number;

  @IsOptional()
  @IsNumber()
  estimatedTimeline?: number; // days

  @IsArray()
  @IsString({ each: true })
  riskFactors: string[];

  @IsArray()
  @IsString({ each: true })
  recommendations: string[];
}

export class CreateComplianceTaskDto {
  @IsString()
  regulatoryChangeId: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsEnum(ComplianceArea)
  complianceArea: ComplianceArea;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  assignedToName?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dueDate?: Date;

  @IsOptional()
  @IsNumber()
  estimatedHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsString()
  createdBy: string;
}

export class CreatePolicyUpdateDto {
  @IsString()
  regulatoryChangeId: string;

  @IsString()
  policyName: string;

  @IsString()
  policyType: string;

  @IsOptional()
  @IsString()
  oldContent?: string;

  @IsString()
  newContent: string;

  @IsString()
  changeSummary: string;

  @IsEnum(['CREATE', 'UPDATE', 'DELETE'])
  updateType: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  effectiveDate?: Date;
}

export class CreateComplianceTeamDto {
  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsString()
  role: string;

  @IsString()
  department: string;

  @IsArray()
  @IsEnum(ComplianceArea, { each: true })
  expertise: ComplianceArea[];
}

export class CreateRegulatorySubscriptionDto {
  @IsString()
  name: string;

  @IsEnum(RegulatorySource)
  source: RegulatorySource;

  @IsString()
  @IsUrl()
  feedUrl: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsNumber()
  fetchFrequency?: number; // seconds

  @IsOptional()
  filters?: any;
}

export class CreateComplianceTemplateDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsEnum(ComplianceArea)
  complianceArea: ComplianceArea;

  @IsEnum(['TASK_TEMPLATE', 'POLICY_TEMPLATE', 'ASSESSMENT_TEMPLATE'])
  templateType: string;

  content: any;

  @IsOptional()
  variables?: any;

  @IsString()
  createdBy: string;
}
