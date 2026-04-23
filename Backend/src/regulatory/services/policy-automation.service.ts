import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { PolicyUpdate, RegulatoryChange, ComplianceArea } from '../interfaces/regulatory.interface';
import { CreatePolicyUpdateDto } from '../dto/create-regulatory-change.dto';
import { AuditTrailService } from './audit-trail.service';

export interface PolicyTemplate {
  id: string;
  name: string;
  policyType: string;
  complianceArea: ComplianceArea;
  content: string;
  variables: Array<{
    name: string;
    type: 'TEXT' | 'DATE' | 'NUMBER' | 'BOOLEAN';
    description: string;
    required: boolean;
  }>;
  updateTriggers: string[];
}

export interface PolicyGenerationRequest {
  regulatoryChangeId: string;
  regulatoryChange: RegulatoryChange;
  impactAssessment: any;
  targetPolicies: string[];
  autoGenerate: boolean;
  requestedBy: string;
  requestedByName: string;
}

export interface GeneratedPolicy {
  policyName: string;
  policyType: string;
  oldContent?: string;
  newContent: string;
  changeSummary: string;
  updateType: 'CREATE' | 'UPDATE' | 'DELETE';
  confidence: number;
  requiresReview: boolean;
  estimatedReviewTime: number; // hours
}

@Injectable()
export class PolicyAutomationService {
  private readonly logger = new Logger(PolicyAutomationService.name);
  private readonly openai: OpenAI;
  private readonly policyTemplates: Map<string, PolicyTemplate> = new Map();
  private readonly existingPolicies: Map<string, string> = new Map(); // policyName -> content

  constructor(private readonly auditTrailService: AuditTrailService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.initializePolicyTemplates();
    this.loadExistingPolicies();
  }

  private initializePolicyTemplates(): void {
    // AML Policy Template
    this.policyTemplates.set('AML_POLICY', {
      id: 'AML_POLICY',
      name: 'Anti-Money Laundering Policy',
      policyType: 'COMPLIANCE_POLICY',
      complianceArea: ComplianceArea.AML,
      content: `
# Anti-Money Laundering Policy

## 1. Purpose
This policy outlines our commitment to preventing money laundering and terrorist financing activities.

## 2. Scope
This policy applies to all employees, contractors, and agents of {{COMPANY_NAME}}.

## 3. Customer Due Diligence
- {{CDD_REQUIREMENTS}}
- {{ENHANCED_DDD_REQUIREMENTS}}

## 4. Transaction Monitoring
- {{MONITORING_THRESHOLD}}
- {{SUSPICIOUS_ACTIVITY_REPORTING}}

## 5. Record Keeping
- {{RECORD_RETENTION_PERIOD}}

## 6. Training Requirements
- {{TRAINING_FREQUENCY}}

## 7. Effective Date
{{EFFECTIVE_DATE}}

## 8. Last Updated
{{UPDATE_DATE}}
      `.trim(),
      variables: [
        { name: 'COMPANY_NAME', type: 'TEXT', description: 'Company name', required: true },
        { name: 'CDD_REQUIREMENTS', type: 'TEXT', description: 'Customer due diligence requirements', required: true },
        { name: 'ENHANCED_DDD_REQUIREMENTS', type: 'TEXT', description: 'Enhanced due diligence requirements', required: true },
        { name: 'MONITORING_THRESHOLD', type: 'TEXT', description: 'Transaction monitoring threshold', required: true },
        { name: 'SUSPICIOUS_ACTIVITY_REPORTING', type: 'TEXT', description: 'Suspicious activity reporting procedures', required: true },
        { name: 'RECORD_RETENTION_PERIOD', type: 'TEXT', description: 'Record retention period', required: true },
        { name: 'TRAINING_FREQUENCY', type: 'TEXT', description: 'Training frequency requirements', required: true },
        { name: 'EFFECTIVE_DATE', type: 'DATE', description: 'Policy effective date', required: true },
        { name: 'UPDATE_DATE', type: 'DATE', description: 'Last update date', required: true },
      ],
      updateTriggers: ['AML', 'money laundering', 'customer due diligence', 'CDD', 'suspicious activity'],
    });

    // KYC Policy Template
    this.policyTemplates.set('KYC_POLICY', {
      id: 'KYC_POLICY',
      name: 'Know Your Customer Policy',
      policyType: 'COMPLIANCE_POLICY',
      complianceArea: ComplianceArea.KYC,
      content: `
# Know Your Customer Policy

## 1. Purpose
This policy establishes the minimum standards for customer identification and verification.

## 2. Customer Identification
- {{IDENTIFICATION_REQUIREMENTS}}
- {{VERIFICATION_METHODS}}

## 3. Risk-Based Approach
- {{RISK_CATEGORIZATION}}
- {{ONGOING_MONITORING}}

## 4. Document Requirements
- {{PRIMARY_DOCUMENTS}}
- {{SECONDARY_DOCUMENTS}}

## 5. Electronic Verification
- {{ELECTRONIC_VERIFICATION_STANDARDS}}

## 6. Effective Date
{{EFFECTIVE_DATE}}

## 7. Last Updated
{{UPDATE_DATE}}
      `.trim(),
      variables: [
        { name: 'IDENTIFICATION_REQUIREMENTS', type: 'TEXT', description: 'Customer identification requirements', required: true },
        { name: 'VERIFICATION_METHODS', type: 'TEXT', description: 'Verification methods', required: true },
        { name: 'RISK_CATEGORIZATION', type: 'TEXT', description: 'Risk categorization approach', required: true },
        { name: 'ONGOING_MONITORING', type: 'TEXT', description: 'Ongoing monitoring procedures', required: true },
        { name: 'PRIMARY_DOCUMENTS', type: 'TEXT', description: 'Primary document requirements', required: true },
        { name: 'SECONDARY_DOCUMENTS', type: 'TEXT', description: 'Secondary document requirements', required: true },
        { name: 'ELECTRONIC_VERIFICATION_STANDARDS', type: 'TEXT', description: 'Electronic verification standards', required: true },
        { name: 'EFFECTIVE_DATE', type: 'DATE', description: 'Policy effective date', required: true },
        { name: 'UPDATE_DATE', type: 'DATE', description: 'Last update date', required: true },
      ],
      updateTriggers: ['KYC', 'customer identification', 'verification', 'customer due diligence'],
    });

    // Data Protection Policy Template
    this.policyTemplates.set('DATA_PROTECTION_POLICY', {
      id: 'DATA_PROTECTION_POLICY',
      name: 'Data Protection Policy',
      policyType: 'COMPLIANCE_POLICY',
      complianceArea: ComplianceArea.DATA_PROTECTION,
      content: `
# Data Protection Policy

## 1. Purpose
This policy outlines our commitment to protecting personal data and privacy.

## 2. Data Collection
- {{DATA_COLLECTION_PRINCIPLES}}
- {{CONSENT_REQUIREMENTS}}

## 3. Data Processing
- {{PROCESSING_LIMITATIONS}}
- {{DATA_MINIMIZATION}}

## 4. Data Storage
- {{STORAGE_SECURITY_MEASURES}}
- {{RETENTION_PERIODS}}

## 5. Data Subject Rights
- {{SUBJECT_RIGHTS_PROCEDURES}}

## 6. Breach Notification
- {{BREACH_NOTIFICATION_TIMEFRAME}}

## 7. Effective Date
{{EFFECTIVE_DATE}}

## 8. Last Updated
{{UPDATE_DATE}}
      `.trim(),
      variables: [
        { name: 'DATA_COLLECTION_PRINCIPLES', type: 'TEXT', description: 'Data collection principles', required: true },
        { name: 'CONSENT_REQUIREMENTS', type: 'TEXT', description: 'Consent requirements', required: true },
        { name: 'PROCESSING_LIMITATIONS', type: 'TEXT', description: 'Data processing limitations', required: true },
        { name: 'DATA_MINIMIZATION', type: 'TEXT', description: 'Data minimization practices', required: true },
        { name: 'STORAGE_SECURITY_MEASURES', type: 'TEXT', description: 'Storage security measures', required: true },
        { name: 'RETENTION_PERIODS', type: 'TEXT', description: 'Data retention periods', required: true },
        { name: 'SUBJECT_RIGHTS_PROCEDURES', type: 'TEXT', description: 'Data subject rights procedures', required: true },
        { name: 'BREACH_NOTIFICATION_TIMEFRAME', type: 'TEXT', description: 'Breach notification timeframe', required: true },
        { name: 'EFFECTIVE_DATE', type: 'DATE', description: 'Policy effective date', required: true },
        { name: 'UPDATE_DATE', type: 'DATE', description: 'Last update date', required: true },
      ],
      updateTriggers: ['data protection', 'privacy', 'GDPR', 'personal data', 'consent'],
    });
  }

  private loadExistingPolicies(): void {
    // In a real implementation, this would load from a database
    this.existingPolicies.set('Anti-Money Laundering Policy', 'Existing AML policy content...');
    this.existingPolicies.set('Know Your Customer Policy', 'Existing KYC policy content...');
    this.existingPolicies.set('Data Protection Policy', 'Existing data protection policy content...');
  }

  async generatePolicyUpdates(request: PolicyGenerationRequest): Promise<GeneratedPolicy[]> {
    this.logger.log(`Generating policy updates for regulatory change ${request.regulatoryChangeId}`);

    const generatedPolicies: GeneratedPolicy[] = [];

    // Identify relevant policy templates
    const relevantTemplates = this.findRelevantTemplates(request.regulatoryChange);

    for (const template of relevantTemplates) {
      try {
        const policy = await this.generatePolicyUpdate(template, request);
        generatedPolicies.push(policy);
      } catch (error) {
        this.logger.error(`Failed to generate policy update for ${template.name}:`, error);
      }
    }

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: request.regulatoryChangeId,
      action: 'POLICY_AUTO_GENERATION',
      actorId: request.requestedBy,
      actorName: request.requestedByName,
      actorRole: 'Compliance Officer',
      details: {
        generatedPolicies: generatedPolicies.length,
        templates: relevantTemplates.map(t => t.name),
      },
    });

    return generatedPolicies;
  }

  async createPolicyUpdate(
    createPolicyDto: CreatePolicyUpdateDto,
    createdBy: string,
    createdByName: string
  ): Promise<PolicyUpdate> {
    this.logger.log(`Creating policy update: ${createPolicyDto.policyName}`);

    const policyUpdate: PolicyUpdate = {
      id: this.generateId(),
      regulatoryChangeId: createPolicyDto.regulatoryChangeId,
      policyName: createPolicyDto.policyName,
      policyType: createPolicyDto.policyType,
      oldContent: createPolicyDto.oldContent,
      newContent: createPolicyDto.newContent,
      changeSummary: createPolicyDto.changeSummary,
      updateType: createPolicyDto.updateType,
      autoGenerated: false,
      status: 'PENDING',
      effectiveDate: createPolicyDto.effectiveDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: createPolicyDto.regulatoryChangeId,
      action: 'POLICY_UPDATE_CREATED',
      actorId: createdBy,
      actorName: createdByName,
      actorRole: 'Compliance Officer',
      details: {
        policyName: createPolicyDto.policyName,
        updateType: createPolicyDto.updateType,
      },
    });

    return policyUpdate;
  }

  private findRelevantTemplates(regulatoryChange: RegulatoryChange): PolicyTemplate[] {
    const relevantTemplates: PolicyTemplate[] = [];
    const searchText = `${regulatoryChange.title} ${regulatoryChange.summary} ${regulatoryChange.complianceAreas.join(' ')}`.toLowerCase();

    for (const template of this.policyTemplates.values()) {
      // Check if compliance areas match
      if (regulatoryChange.complianceAreas.includes(template.complianceArea)) {
        relevantTemplates.push(template);
        continue;
      }

      // Check if trigger keywords are present
      const hasTriggerKeyword = template.updateTriggers.some(trigger =>
        searchText.includes(trigger.toLowerCase())
      );

      if (hasTriggerKeyword) {
        relevantTemplates.push(template);
      }
    }

    return relevantTemplates;
  }

  private async generatePolicyUpdate(
    template: PolicyTemplate,
    request: PolicyGenerationRequest
  ): Promise<GeneratedPolicy> {
    const existingContent = this.existingPolicies.get(template.name);
    
    // Generate new content using AI
    const newContent = await this.generatePolicyContent(template, request);
    
    // Determine update type
    const updateType = this.determineUpdateType(existingContent, newContent);
    
    // Generate change summary
    const changeSummary = await this.generateChangeSummary(existingContent, newContent, request);

    return {
      policyName: template.name,
      policyType: template.policyType,
      oldContent: existingContent,
      newContent,
      changeSummary,
      updateType,
      confidence: 0.85, // AI-generated confidence
      requiresReview: true,
      estimatedReviewTime: this.estimateReviewTime(updateType, template.complianceArea),
    };
  }

  private async generatePolicyContent(
    template: PolicyTemplate,
    request: PolicyGenerationRequest
  ): Promise<string> {
    try {
      const prompt = `
Based on the following regulatory change, update the policy template content:

Regulatory Change:
Title: ${request.regulatoryChange.title}
Summary: ${request.regulatoryChange.summary}
Change Type: ${request.regulatoryChange.changeType}
Compliance Areas: ${request.regulatoryChange.complianceAreas.join(', ')}

Current Template:
${template.content}

Impact Assessment:
${JSON.stringify(request.impactAssessment, null, 2)}

Please generate updated policy content that:
1. Incorporates the new regulatory requirements
2. Maintains the existing structure and format
3. Is clear, concise, and actionable
4. Includes specific implementation steps
5. Updates effective dates and compliance timelines

Return only the updated policy content without additional commentary.
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a regulatory compliance expert specializing in policy development. Generate clear, compliant policy content.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content || template.content;
    } catch (error) {
      this.logger.error('AI policy generation failed, using template:', error);
      // Fallback to template with basic updates
      return this.updateTemplateWithBasicChanges(template, request);
    }
  }

  private async generateChangeSummary(
    oldContent: string | undefined,
    newContent: string,
    request: PolicyGenerationRequest
  ): Promise<string> {
    try {
      const prompt = `
Generate a concise change summary for the following policy update:

Regulatory Change: ${request.regulatoryChange.title}
Change Type: ${request.regulatoryChange.changeType}

${oldContent ? 'Previous Content (excerpt):' + oldContent.substring(0, 500) + '...' : 'New Policy'}
New Content (excerpt): ${newContent.substring(0, 500)}...

Provide a 2-3 sentence summary explaining what changed and why.
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a compliance expert. Generate concise, accurate change summaries.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content || 
             `Policy updated to reflect ${request.regulatoryChange.title}. Changes include new compliance requirements and updated procedures.`;
    } catch (error) {
      this.logger.error('AI summary generation failed:', error);
      return `Policy updated to reflect ${request.regulatoryChange.title}. Changes include new compliance requirements and updated procedures.`;
    }
  }

  private determineUpdateType(oldContent: string | undefined, newContent: string): 'CREATE' | 'UPDATE' | 'DELETE' {
    if (!oldContent) return 'CREATE';
    if (newContent.toLowerCase().includes('this policy is revoked') || 
        newContent.toLowerCase().includes('this policy is terminated')) {
      return 'DELETE';
    }
    return 'UPDATE';
  }

  private estimateReviewTime(updateType: string, complianceArea: ComplianceArea): number {
    const baseTimes = {
      'CREATE': 8,
      'UPDATE': 4,
      'DELETE': 2,
    };

    const areaMultipliers = {
      [ComplianceArea.AML]: 1.5,
      [ComplianceArea.KYC]: 1.2,
      [ComplianceArea.REPORTING]: 1.3,
      [ComplianceArea.LICENSING]: 1.4,
      [ComplianceArea.DATA_PROTECTION]: 1.6,
      [ComplianceArea.PRIVACY]: 1.4,
      [ComplianceArea.CAPITAL_REQUIREMENTS]: 1.8,
      [ComplianceArea.RISK_MANAGEMENT]: 1.3,
      [ComplianceArea.CONSUMER_PROTECTION]: 1.2,
      [ComplianceArea.MARKET_INTEGRITY]: 1.5,
    };

    const baseTime = baseTimes[updateType as keyof typeof baseTimes] || 4;
    const multiplier = areaMultipliers[complianceArea] || 1.0;

    return baseTime * multiplier;
  }

  private updateTemplateWithBasicChanges(template: PolicyTemplate, request: PolicyGenerationRequest): string {
    let content = template.content;
    
    // Update effective date
    const effectiveDate = new Date();
    content = content.replace('{{EFFECTIVE_DATE}}', effectiveDate.toISOString().split('T')[0]);
    content = content.replace('{{UPDATE_DATE}}', effectiveDate.toISOString().split('T')[0]);

    // Add regulatory change reference
    const regulatoryNote = `\n## Regulatory Update Notice\nThis policy has been updated in response to: ${request.regulatoryChange.title} (${request.regulatoryChange.publicationDate.toISOString().split('T')[0]})\n`;
    
    return content + regulatoryNote;
  }

  getPolicyTemplate(templateId: string): PolicyTemplate | undefined {
    return this.policyTemplates.get(templateId);
  }

  getAllPolicyTemplates(): PolicyTemplate[] {
    return Array.from(this.policyTemplates.values());
  }

  getExistingPolicy(policyName: string): string | undefined {
    return this.existingPolicies.get(policyName);
  }

  updateExistingPolicy(policyName: string, content: string): void {
    this.existingPolicies.set(policyName, content);
  }

  private generateId(): string {
    return 'policy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
