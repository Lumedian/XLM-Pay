import { Injectable, Logger } from '@nestjs/common';
import { ImpactAssessment, ImpactLevel, RegulatoryChange, ComplianceArea } from '../interfaces/regulatory.interface';
import { CreateImpactAssessmentDto } from '../dto/create-regulatory-change.dto';
import { AuditTrailService } from './audit-trail.service';

export interface ImpactAssessmentTemplate {
  id: string;
  name: string;
  complianceArea: ComplianceArea;
  questions: Array<{
    id: string;
    question: string;
    type: 'RATING' | 'YES_NO' | 'TEXT' | 'MULTIPLE_CHOICE';
    required: boolean;
    options?: string[];
    weight: number;
  }>;
  scoringMatrix: {
    [key: string]: {
      CRITICAL: number;
      HIGH: number;
      MEDIUM: number;
      LOW: number;
      MINIMAL: number;
    };
  };
}

export interface AssessmentWorkflow {
  regulatoryChangeId: string;
  currentStep: string;
  steps: Array<{
    id: string;
    name: string;
    description: string;
    assignedTo?: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
    dueDate?: Date;
    completedAt?: Date;
    notes?: string;
    dependencies?: string[];
  }>;
  estimatedCompletion: Date;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  blockers: string[];
}

@Injectable()
export class ImpactAssessmentService {
  private readonly logger = new Logger(ImpactAssessmentService.name);
  private readonly assessmentTemplates: Map<string, ImpactAssessmentTemplate> = new Map();
  private readonly activeWorkflows: Map<string, AssessmentWorkflow> = new Map();

  constructor(private readonly auditTrailService: AuditTrailService) {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // AML Assessment Template
    this.assessmentTemplates.set('AML_ASSESSMENT', {
      id: 'AML_ASSESSMENT',
      name: 'Anti-Money Laundering Impact Assessment',
      complianceArea: ComplianceArea.AML,
      questions: [
        {
          id: 'aml_1',
          question: 'Does this change affect AML/KYC requirements?',
          type: 'YES_NO',
          required: true,
          weight: 0.3,
        },
        {
          id: 'aml_2',
          question: 'What is the expected impact on customer onboarding?',
          type: 'RATING',
          required: true,
          weight: 0.25,
        },
        {
          id: 'aml_3',
          question: 'Are new monitoring systems required?',
          type: 'YES_NO',
          required: true,
          weight: 0.2,
        },
        {
          id: 'aml_4',
          question: 'Estimated implementation cost (USD)',
          type: 'TEXT',
          required: false,
          weight: 0.15,
        },
        {
          id: 'aml_5',
          question: 'Timeline for compliance (months)',
          type: 'MULTIPLE_CHOICE',
          required: true,
          weight: 0.1,
          options: ['0-3', '3-6', '6-12', '12+'],
        },
      ],
      scoringMatrix: {
        HIGH_IMPACT: { CRITICAL: 100, HIGH: 80, MEDIUM: 60, LOW: 40, MINIMAL: 20 },
        MEDIUM_IMPACT: { CRITICAL: 80, HIGH: 70, MEDIUM: 50, LOW: 30, MINIMAL: 15 },
        LOW_IMPACT: { CRITICAL: 60, HIGH: 50, MEDIUM: 40, LOW: 25, MINIMAL: 10 },
      },
    });

    // Licensing Assessment Template
    this.assessmentTemplates.set('LICENSING_ASSESSMENT', {
      id: 'LICENSING_ASSESSMENT',
      name: 'Licensing Requirements Impact Assessment',
      complianceArea: ComplianceArea.LICENSING,
      questions: [
        {
          id: 'lic_1',
          question: 'Does this require new licenses or permits?',
          type: 'YES_NO',
          required: true,
          weight: 0.4,
        },
        {
          id: 'lic_2',
          question: 'Impact on existing licenses?',
          type: 'MULTIPLE_CHOICE',
          required: true,
          weight: 0.3,
          options: ['No impact', 'Minor amendments', 'Major amendments', 'Revocation required'],
        },
        {
          id: 'lic_3',
          question: 'Application complexity',
          type: 'RATING',
          required: true,
          weight: 0.2,
        },
        {
          id: 'lic_4',
          question: 'Legal review required?',
          type: 'YES_NO',
          required: true,
          weight: 0.1,
        },
      ],
      scoringMatrix: {
        HIGH_COMPLEXITY: { CRITICAL: 100, HIGH: 85, MEDIUM: 65, LOW: 45, MINIMAL: 25 },
        MEDIUM_COMPLEXITY: { CRITICAL: 85, HIGH: 70, MEDIUM: 55, LOW: 35, MINIMAL: 20 },
        LOW_COMPLEXITY: { CRITICAL: 70, HIGH: 55, MEDIUM: 40, LOW: 25, MINIMAL: 15 },
      },
    });

    // Reporting Assessment Template
    this.assessmentTemplates.set('REPORTING_ASSESSMENT', {
      id: 'REPORTING_ASSESSMENT',
      name: 'Reporting Requirements Impact Assessment',
      complianceArea: ComplianceArea.REPORTING,
      questions: [
        {
          id: 'rep_1',
          question: 'New reporting requirements introduced?',
          type: 'YES_NO',
          required: true,
          weight: 0.35,
        },
        {
          id: 'rep_2',
          question: 'Frequency of reporting affected?',
          type: 'MULTIPLE_CHOICE',
          required: true,
          weight: 0.25,
          options: ['No change', 'Increased frequency', 'Decreased frequency', 'New schedule'],
        },
        {
          id: 'rep_3',
          question: 'Technical system changes required?',
          type: 'RATING',
          required: true,
          weight: 0.25,
        },
        {
          id: 'rep_4',
          question: 'Data collection impact',
          type: 'RATING',
          required: true,
          weight: 0.15,
        },
      ],
      scoringMatrix: {
        HIGH_FREQUENCY: { CRITICAL: 95, HIGH: 75, MEDIUM: 55, LOW: 35, MINIMAL: 20 },
        MEDIUM_FREQUENCY: { CRITICAL: 80, HIGH: 65, MEDIUM: 50, LOW: 30, MINIMAL: 15 },
        LOW_FREQUENCY: { CRITICAL: 65, HIGH: 50, MEDIUM: 40, LOW: 25, MINIMAL: 10 },
      },
    });
  }

  async initiateAssessment(
    regulatoryChange: RegulatoryChange,
    assessorId: string,
    assessorName: string
  ): Promise<AssessmentWorkflow> {
    this.logger.log(`Initiating impact assessment for change ${regulatoryChange.id}`);

    // Create assessment workflow
    const workflow = this.createAssessmentWorkflow(regulatoryChange, assessorId, assessorName);
    this.activeWorkflows.set(regulatoryChange.id, workflow);

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: regulatoryChange.id,
      action: 'ASSESSMENT_INITIATED',
      actorId: assessorId,
      actorName: assessorName,
      actorRole: 'Compliance Officer',
      details: { workflowId: workflow.currentStep },
    });

    return workflow;
  }

  async submitAssessment(
    regulatoryChangeId: string,
    assessmentData: CreateImpactAssessmentDto,
    responses: any
  ): Promise<ImpactAssessment> {
    this.logger.log(`Submitting assessment for change ${regulatoryChangeId}`);

    // Calculate impact level based on responses
    const calculatedImpactLevel = this.calculateImpactLevel(assessmentData.complianceArea, responses);

    // Create impact assessment
    const assessment: ImpactAssessment = {
      id: this.generateId(),
      regulatoryChangeId,
      assessorId: assessmentData.assessorId,
      assessorName: assessmentData.assessorName,
      impactLevel: calculatedImpactLevel,
      impactSummary: this.generateImpactSummary(assessmentData, responses),
      affectedOperations: this.identifyAffectedOperations(assessmentData, responses),
      requiredActions: this.identifyRequiredActions(assessmentData, responses),
      estimatedCost: assessmentData.estimatedCost,
      estimatedTimeline: assessmentData.estimatedTimeline,
      riskFactors: assessmentData.riskFactors,
      recommendations: assessmentData.recommendations,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Update workflow status
    this.updateWorkflowProgress(regulatoryChangeId, 'ASSESSMENT_SUBMITTED');

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId,
      action: 'ASSESSMENT_SUBMITTED',
      actorId: assessmentData.assessorId,
      actorName: assessmentData.assessorName,
      actorRole: 'Compliance Officer',
      details: { 
        impactLevel: calculatedImpactLevel,
        estimatedCost: assessmentData.estimatedCost,
        estimatedTimeline: assessmentData.estimatedTimeline,
      },
    });

    return assessment;
  }

  async approveAssessment(
    assessmentId: string,
    approvedBy: string,
    approvedByName: string
  ): Promise<ImpactAssessment> {
    this.logger.log(`Approving assessment ${assessmentId}`);

    // In a real implementation, update in database
    const assessment: Partial<ImpactAssessment> = {
      status: 'APPROVED',
      approvedBy,
      approvedAt: new Date(),
      updatedAt: new Date(),
    };

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: assessmentId, // This would be the actual regulatory change ID
      action: 'ASSESSMENT_APPROVED',
      actorId: approvedBy,
      actorName: approvedByName,
      actorRole: 'Compliance Manager',
      details: { assessmentId },
    });

    return assessment as ImpactAssessment;
  }

  private createAssessmentWorkflow(
    regulatoryChange: RegulatoryChange,
    assessorId: string,
    assessorName: string
  ): AssessmentWorkflow {
    const baseSteps = [
      {
        id: 'initial_review',
        name: 'Initial Review',
        description: 'Review regulatory change and determine assessment requirements',
        assignedTo: assessorId,
        status: 'IN_PROGRESS' as const,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
      {
        id: 'detailed_assessment',
        name: 'Detailed Impact Assessment',
        description: 'Complete comprehensive impact assessment using relevant templates',
        assignedTo: assessorId,
        status: 'PENDING' as const,
        dueDate: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
        dependencies: ['initial_review'],
      },
      {
        id: 'stakeholder_review',
        name: 'Stakeholder Review',
        description: 'Review assessment with relevant stakeholders',
        status: 'PENDING' as const,
        dueDate: new Date(Date.now() + 120 * 60 * 60 * 1000), // 120 hours
        dependencies: ['detailed_assessment'],
      },
      {
        id: 'final_approval',
        name: 'Final Approval',
        description: 'Obtain final approval from compliance management',
        status: 'PENDING' as const,
        dueDate: new Date(Date.now() + 168 * 60 * 60 * 1000), // 168 hours
        dependencies: ['stakeholder_review'],
      },
    ];

    // Add additional steps based on impact level
    if (regulatoryChange.relevanceScore > 0.8) {
      baseSteps.splice(2, 0, {
        id: 'legal_review',
        name: 'Legal Review',
        description: 'Mandatory legal review for high-impact changes',
        status: 'PENDING' as const,
        dueDate: new Date(Date.now() + 96 * 60 * 60 * 1000), // 96 hours
        dependencies: ['detailed_assessment'],
      });
    }

    return {
      regulatoryChangeId: regulatoryChange.id,
      currentStep: 'initial_review',
      steps: baseSteps,
      estimatedCompletion: new Date(Date.now() + 168 * 60 * 60 * 1000), // 7 days
      priority: this.determinePriority(regulatoryChange),
      blockers: [],
    };
  }

  private calculateImpactLevel(complianceArea: ComplianceArea, responses: any): ImpactLevel {
    const template = this.assessmentTemplates.get(`${complianceArea}_ASSESSMENT`);
    if (!template) return ImpactLevel.MEDIUM;

    let totalScore = 0;
    let totalWeight = 0;

    template.questions.forEach(question => {
      const response = responses[question.id];
      if (response !== undefined) {
        const score = this.getResponseScore(response, question.type);
        totalScore += score * question.weight;
        totalWeight += question.weight;
      }
    });

    const averageScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;

    // Map score to impact level
    if (averageScore >= 0.8) return ImpactLevel.CRITICAL;
    if (averageScore >= 0.6) return ImpactLevel.HIGH;
    if (averageScore >= 0.4) return ImpactLevel.MEDIUM;
    if (averageScore >= 0.2) return ImpactLevel.LOW;
    return ImpactLevel.MINIMAL;
  }

  private getResponseScore(response: any, questionType: string): number {
    switch (questionType) {
      case 'YES_NO':
        return response === true ? 0.8 : 0.2;
      case 'RATING':
        return (response || 0) / 10; // Assuming 1-10 scale
      case 'MULTIPLE_CHOICE':
        const choiceScores: { [key: string]: number } = {
          'No impact': 0.1,
          'Minor amendments': 0.4,
          'Major amendments': 0.7,
          'Revocation required': 1.0,
          'No change': 0.1,
          'Increased frequency': 0.8,
          'Decreased frequency': 0.6,
          'New schedule': 0.9,
          '0-3': 0.3,
          '3-6': 0.6,
          '6-12': 0.8,
          '12+': 1.0,
        };
        return choiceScores[response] || 0.5;
      case 'TEXT':
        // For text responses, estimate based on content analysis
        if (typeof response === 'string') {
          const text = response.toLowerCase();
          if (text.includes('high') || text.includes('complex') || text.includes('extensive')) {
            return 0.8;
          } else if (text.includes('medium') || text.includes('moderate')) {
            return 0.5;
          } else if (text.includes('low') || text.includes('minimal') || text.includes('simple')) {
            return 0.3;
          }
        }
        return 0.5;
      default:
        return 0.5;
    }
  }

  private generateImpactSummary(assessmentData: CreateImpactAssessmentDto, responses: any): string {
    const impactLevel = assessmentData.impactLevel;
    const complianceArea = assessmentData.complianceArea;
    
    return `This regulatory change has a ${impactLevel.toLowerCase()} impact on ${complianceArea} operations. ` +
           `Key considerations include ${assessmentData.riskFactors.join(', ').toLowerCase()}. ` +
           `Estimated implementation timeline: ${assessmentData.estimatedTimeline || 'TBD'} days.`;
  }

  private identifyAffectedOperations(assessmentData: CreateImpactAssessmentDto, responses: any): string[] {
    const operations = [];
    
    if (assessmentData.complianceArea === ComplianceArea.AML) {
      operations.push('Customer onboarding', 'Transaction monitoring', 'Suspicious activity reporting');
    } else if (assessmentData.complianceArea === ComplianceArea.LICENSING) {
      operations.push('License applications', 'Regulatory filings', 'Compliance reporting');
    } else if (assessmentData.complianceArea === ComplianceArea.REPORTING) {
      operations.push('Financial reporting', 'Regulatory submissions', 'Data collection');
    }

    // Add operations based on responses
    if (responses.technical_changes_required === true) {
      operations.push('System development', 'IT infrastructure');
    }

    return operations;
  }

  private identifyRequiredActions(assessmentData: CreateImpactAssessmentDto, responses: any): string[] {
    const actions = [];

    if (assessmentData.impactLevel === ImpactLevel.CRITICAL || assessmentData.impactLevel === ImpactLevel.HIGH) {
      actions.push('Immediate management notification', 'Legal consultation', 'Implementation planning');
    }

    if (assessmentData.estimatedCost && assessmentData.estimatedCost > 100000) {
      actions.push('Budget approval', 'Cost-benefit analysis');
    }

    if (assessmentData.estimatedTimeline && assessmentData.estimatedTimeline > 90) {
      actions.push('Phased implementation plan', 'Milestone tracking');
    }

    actions.push(...assessmentData.recommendations);

    return [...new Set(actions)]; // Remove duplicates
  }

  private determinePriority(regulatoryChange: RegulatoryChange): 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (regulatoryChange.relevanceScore > 0.9) return 'URGENT';
    if (regulatoryChange.relevanceScore > 0.7) return 'HIGH';
    if (regulatoryChange.relevanceScore > 0.5) return 'MEDIUM';
    return 'LOW';
  }

  private updateWorkflowProgress(regulatoryChangeId: string, stepId: string): void {
    const workflow = this.activeWorkflows.get(regulatoryChangeId);
    if (workflow) {
      const currentStep = workflow.steps.find(step => step.id === stepId);
      if (currentStep) {
        currentStep.status = 'COMPLETED';
        currentStep.completedAt = new Date();
        
        // Move to next step
        const nextStep = workflow.steps.find(step => 
          step.status === 'PENDING' && 
          (!step.dependencies || step.dependencies.every(dep => 
            workflow.steps.find(s => s.id === dep)?.status === 'COMPLETED'
          ))
        );
        
        if (nextStep) {
          nextStep.status = 'IN_PROGRESS';
          workflow.currentStep = nextStep.id;
        }
      }
    }
  }

  getWorkflow(regulatoryChangeId: string): AssessmentWorkflow | undefined {
    return this.activeWorkflows.get(regulatoryChangeId);
  }

  getAssessmentTemplate(complianceArea: ComplianceArea): ImpactAssessmentTemplate | undefined {
    return this.assessmentTemplates.get(`${complianceArea}_ASSESSMENT`);
  }

  getAllTemplates(): ImpactAssessmentTemplate[] {
    return Array.from(this.assessmentTemplates.values());
  }

  private generateId(): string {
    return 'ia_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
