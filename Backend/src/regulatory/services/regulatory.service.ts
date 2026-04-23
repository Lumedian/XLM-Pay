import { Injectable, Logger } from '@nestjs/common';
import { 
  RegulatoryChange, 
  ImpactAssessment, 
  ComplianceTask, 
  PolicyUpdate, 
  RegulatoryDashboard,
  ComplianceMetrics 
} from '../interfaces/regulatory.interface';
import { CreateRegulatoryChangeDto, CreateImpactAssessmentDto, CreateComplianceTaskDto, CreatePolicyUpdateDto } from '../dto/create-regulatory-change.dto';
import { RegulatoryAggregationService } from './regulatory-aggregation.service';
import { RelevanceScoringService } from './relevance-scoring.service';
import { ImpactAssessmentService } from './impact-assessment.service';
import { ComplianceTaskService } from './compliance-task.service';
import { PolicyAutomationService } from './policy-automation.service';
import { AuditTrailService } from './audit-trail.service';
import { CollaborationService } from './collaboration.service';

@Injectable()
export class RegulatoryService {
  private readonly logger = new Logger(RegulatoryService.name);
  private readonly regulatoryChanges: Map<string, RegulatoryChange> = new Map();

  constructor(
    private readonly aggregationService: RegulatoryAggregationService,
    private readonly relevanceScoringService: RelevanceScoringService,
    private readonly impactAssessmentService: ImpactAssessmentService,
    private readonly complianceTaskService: ComplianceTaskService,
    private readonly policyAutomationService: PolicyAutomationService,
    private readonly auditTrailService: AuditTrailService,
    private readonly collaborationService: CollaborationService,
  ) {}

  async getRegulatoryChanges(filters?: {
    source?: string;
    changeType?: string;
    relevanceScore?: number;
    isProcessed?: boolean;
    isAssessed?: boolean;
    startDate?: Date;
    endDate?: Date;
  }): Promise<RegulatoryChange[]> {
    let changes = Array.from(this.regulatoryChanges.values());

    // Apply filters
    if (filters) {
      if (filters.source) {
        changes = changes.filter(change => change.source === filters.source);
      }
      if (filters.changeType) {
        changes = changes.filter(change => change.changeType === filters.changeType);
      }
      if (filters.relevanceScore !== undefined) {
        changes = changes.filter(change => change.relevanceScore >= filters.relevanceScore!);
      }
      if (filters.isProcessed !== undefined) {
        changes = changes.filter(change => change.isProcessed === filters.isProcessed);
      }
      if (filters.isAssessed !== undefined) {
        changes = changes.filter(change => change.isAssessed === filters.isAssessed);
      }
      if (filters.startDate) {
        changes = changes.filter(change => change.publicationDate >= filters.startDate!);
      }
      if (filters.endDate) {
        changes = changes.filter(change => change.publicationDate <= filters.endDate!);
      }
    }

    // Sort by publication date (newest first)
    return changes.sort((a, b) => b.publicationDate.getTime() - a.publicationDate.getTime());
  }

  async getRegulatoryChange(id: string): Promise<RegulatoryChange | null> {
    return this.regulatoryChanges.get(id) || null;
  }

  async createRegulatoryChange(createDto: CreateRegulatoryChangeDto): Promise<RegulatoryChange> {
    const regulatoryChange: RegulatoryChange = {
      id: this.generateId(),
      title: createDto.title,
      summary: createDto.summary,
      content: createDto.content,
      source: createDto.source,
      sourceUrl: createDto.sourceUrl,
      changeType: createDto.changeType,
      publicationDate: createDto.publicationDate,
      effectiveDate: createDto.effectiveDate,
      relevanceScore: 0, // Will be calculated
      jurisdictions: createDto.jurisdictions,
      complianceAreas: createDto.complianceAreas,
      aiTags: createDto.aiTags,
      isProcessed: false,
      isAssessed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.regulatoryChanges.set(regulatoryChange.id, regulatoryChange);

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: regulatoryChange.id,
      action: 'REGULATORY_CHANGE_CREATED',
      actorId: 'system',
      actorName: 'System',
      actorRole: 'System',
      details: {
        source: regulatoryChange.source,
        changeType: regulatoryChange.changeType,
      },
    });

    return regulatoryChange;
  }

  async processRegulatoryChange(
    id: string,
    processedBy: string,
    processedByName: string
  ): Promise<RegulatoryChange | null> {
    const regulatoryChange = this.regulatoryChanges.get(id);
    if (!regulatoryChange) {
      return null;
    }

    regulatoryChange.isProcessed = true;
    regulatoryChange.updatedAt = new Date();

    // Create collaboration workspace
    await this.collaborationService.createWorkspace(
      id,
      regulatoryChange,
      processedBy,
      processedByName
    );

    // Request impact assessment if relevance score is high
    if (regulatoryChange.relevanceScore > 0.7) {
      await this.collaborationService.requestAssessment(
        id,
        regulatoryChange,
        processedBy,
        processedByName
      );
    }

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: id,
      action: 'REGULATORY_CHANGE_PROCESSED',
      actorId: processedBy,
      actorName: processedByName,
      actorRole: 'Compliance Officer',
      details: {
        relevanceScore: regulatoryChange.relevanceScore,
        collaborationWorkspaceCreated: true,
        assessmentRequested: regulatoryChange.relevanceScore > 0.7,
      },
    });

    return regulatoryChange;
  }

  async initiateImpactAssessment(
    regulatoryChangeId: string,
    assessorId: string,
    assessorName: string
  ): Promise<any> {
    const regulatoryChange = this.regulatoryChanges.get(regulatoryChangeId);
    if (!regulatoryChange) {
      throw new Error('Regulatory change not found');
    }

    return this.impactAssessmentService.initiateAssessment(
      regulatoryChange,
      assessorId,
      assessorName
    );
  }

  async submitImpactAssessment(
    assessmentData: CreateImpactAssessmentDto,
    responses: any
  ): Promise<ImpactAssessment> {
    const assessment = await this.impactAssessmentService.submitAssessment(
      assessmentData.regulatoryChangeId,
      assessmentData,
      responses
    );

    // Generate compliance tasks based on assessment
    await this.complianceTaskService.generateTasksFromAssessment(
      assessmentData.regulatoryChangeId,
      assessment,
      assessmentData.assessorId
    );

    // Generate policy updates if needed
    if (assessment.impactLevel === 'CRITICAL' || assessment.impactLevel === 'HIGH') {
      const regulatoryChange = this.regulatoryChanges.get(assessmentData.regulatoryChangeId);
      if (regulatoryChange) {
        const policyUpdates = await this.policyAutomationService.generatePolicyUpdates({
          regulatoryChangeId: assessmentData.regulatoryChangeId,
          regulatoryChange,
          impactAssessment: assessment,
          targetPolicies: [],
          autoGenerate: true,
          requestedBy: assessmentData.assessorId,
          requestedByName: assessmentData.assessorName,
        });

        // Create policy update records
        for (const policyUpdate of policyUpdates) {
          await this.policyAutomationService.createPolicyUpdate(
            {
              regulatoryChangeId: assessmentData.regulatoryChangeId,
              policyName: policyUpdate.policyName,
              policyType: policyUpdate.policyType,
              oldContent: policyUpdate.oldContent,
              newContent: policyUpdate.newContent,
              changeSummary: policyUpdate.changeSummary,
              updateType: policyUpdate.updateType,
              effectiveDate: new Date(),
            },
            assessmentData.assessorId,
            assessmentData.assessorName
          );
        }
      }
    }

    return assessment;
  }

  async getComplianceTasks(filters?: {
    regulatoryChangeId?: string;
    assigneeId?: string;
    status?: string;
    priority?: string;
    complianceArea?: string;
  }): Promise<ComplianceTask[]> {
    if (filters?.regulatoryChangeId) {
      return this.complianceTaskService.getTasksByRegulatoryChange(filters.regulatoryChangeId);
    }
    if (filters?.assigneeId) {
      return this.complianceTaskService.getTasksByAssignee(filters.assigneeId);
    }
    if (filters?.status) {
      return this.complianceTaskService.getTasksByStatus(filters.status as any);
    }
    if (filters?.complianceArea) {
      return this.complianceTaskService.getTasksByComplianceArea(filters.complianceArea as any);
    }

    // Return all tasks (in production, this would be paginated)
    return [];
  }

  async createComplianceTask(createTaskDto: CreateComplianceTaskDto): Promise<ComplianceTask> {
    return this.complianceTaskService.createTask(createTaskDto);
  }

  async getPolicyUpdates(regulatoryChangeId?: string): Promise<PolicyUpdate[]> {
    // In a real implementation, this would query the database
    return [];
  }

  async createPolicyUpdate(createPolicyDto: CreatePolicyUpdateDto): Promise<PolicyUpdate> {
    // In a real implementation, this would create the policy update in the database
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
      actorId: 'system',
      actorName: 'System',
      actorRole: 'System',
      details: {
        policyName: createPolicyDto.policyName,
        updateType: createPolicyDto.updateType,
      },
    });

    return policyUpdate;
  }

  async getRegulatoryDashboard(): Promise<RegulatoryDashboard> {
    const allChanges = Array.from(this.regulatoryChanges.values());
    const metrics = await this.calculateComplianceMetrics();
    
    const recentChanges = allChanges
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    const urgentTasks = await this.complianceTaskService.getTasksByPriority('URGENT' as any);
    const overdueTasks = await this.complianceTaskService.getOverdueTasks();
    const upcomingDeadlines = await this.complianceTaskService.getUpcomingTasks(7);

    const highImpactChanges = allChanges
      .filter(change => change.relevanceScore > 0.8)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);

    // Calculate team workload (simplified)
    const teamWorkload = await this.calculateTeamWorkload();

    // Generate trend data (simplified)
    const trends = {
      changesOverTime: this.generateChangesTrend(allChanges),
      assessmentTimes: [], // Would be calculated from actual assessment data
      complianceScore: [], // Would be calculated from historical compliance scores
    };

    return {
      summary: metrics,
      recentChanges,
      urgentTasks,
      upcomingDeadlines,
      highImpactChanges,
      teamWorkload,
      trends,
    };
  }

  async triggerRegulatoryAggregation(): Promise<RegulatoryChange[]> {
    const aggregatedChanges = await this.aggregationService.triggerAggregation();
    
    // Store aggregated changes
    for (const change of aggregatedChanges) {
      this.regulatoryChanges.set(change.id, change);
    }

    return aggregatedChanges;
  }

  async searchRegulatoryChanges(query: string): Promise<RegulatoryChange[]> {
    const allChanges = Array.from(this.regulatoryChanges.values());
    const queryLower = query.toLowerCase();

    return allChanges.filter(change =>
      change.title.toLowerCase().includes(queryLower) ||
      change.summary.toLowerCase().includes(queryLower) ||
      change.content.toLowerCase().includes(queryLower) ||
      change.complianceAreas.some(area => area.toLowerCase().includes(queryLower)) ||
      (change.aiTags && change.aiTags.some(tag => tag.toLowerCase().includes(queryLower)))
    );
  }

  private async calculateComplianceMetrics(): Promise<ComplianceMetrics> {
    const allChanges = Array.from(this.regulatoryChanges.values());
    const taskMetrics = await this.complianceTaskService.getTaskMetrics();

    return {
      totalChanges: allChanges.length,
      pendingAssessments: allChanges.filter(change => !change.isAssessed).length,
      overdueTasks: taskMetrics.overdueTasks,
      completedTasks: taskMetrics.completedTasks,
      averageAssessmentTime: 48, // Would be calculated from actual data
      averageTaskCompletionTime: taskMetrics.averageCompletionTime,
      complianceScore: this.calculateOverallComplianceScore(allChanges, taskMetrics),
      riskDistribution: this.calculateRiskDistribution(allChanges),
      workloadByTeam: taskMetrics.workloadByAssignee,
    };
  }

  private calculateOverallComplianceScore(changes: RegulatoryChange[], taskMetrics: any): number {
    if (changes.length === 0) return 100;

    const processedPercentage = (changes.filter(c => c.isProcessed).length / changes.length) * 100;
    const assessedPercentage = (changes.filter(c => c.isAssessed).length / changes.length) * 100;
    const taskCompletionRate = taskMetrics.totalTasks > 0 
      ? (taskMetrics.completedTasks / taskMetrics.totalTasks) * 100 
      : 100;

    return Math.round((processedPercentage + assessedPercentage + taskCompletionRate) / 3);
  }

  private calculateRiskDistribution(changes: RegulatoryChange[]): Record<string, number> {
    const distribution = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      MINIMAL: 0,
    };

    changes.forEach(change => {
      if (change.relevanceScore > 0.9) distribution.CRITICAL++;
      else if (change.relevanceScore > 0.7) distribution.HIGH++;
      else if (change.relevanceScore > 0.5) distribution.MEDIUM++;
      else if (change.relevanceScore > 0.3) distribution.LOW++;
      else distribution.MINIMAL++;
    });

    return distribution;
  }

  private async calculateTeamWorkload(): Promise<Array<{
    teamMember: string;
    activeTasks: number;
    overdueTasks: number;
    utilization: number;
  }>> {
    const teamMembers = this.collaborationService.getTeamMembers();
    const workload = [];

    for (const member of teamMembers) {
      const tasks = await this.complianceTaskService.getTasksByAssignee(member.id);
      const overdue = tasks.filter(task => 
        task.dueDate && task.dueDate < new Date() && task.status !== 'COMPLETED'
      );

      workload.push({
        teamMember: member.name,
        activeTasks: tasks.filter(t => t.status === 'IN_PROGRESS').length,
        overdueTasks: overdue.length,
        utilization: tasks.length > 0 ? (tasks.length / 10) * 100 : 0, // Assuming 10 tasks is full capacity
      });
    }

    return workload;
  }

  private generateChangesTrend(changes: RegulatoryChange[]): Array<{ date: string; count: number }> {
    const trend: Record<string, number> = {};
    
    changes.forEach(change => {
      const date = change.createdAt.toISOString().split('T')[0];
      trend[date] = (trend[date] || 0) + 1;
    });

    return Object.entries(trend)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30); // Last 30 days
  }

  private generateId(): string {
    return 'reg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
