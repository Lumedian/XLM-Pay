import { Injectable, Logger } from '@nestjs/common';
import { ComplianceTeam, RegulatoryChange, ImpactAssessment, ComplianceTask, ComplianceArea } from '../interfaces/regulatory.interface';
import { AuditTrailService } from './audit-trail.service';

export interface CollaborationNotification {
  id: string;
  type: 'TASK_ASSIGNED' | 'ASSESSMENT_REQUIRED' | 'POLICY_REVIEW' | 'DEADLINE_REMINDER' | 'URGENT_UPDATE';
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  message: string;
  relatedEntityId: string;
  relatedEntityType: 'REGULATORY_CHANGE' | 'ASSESSMENT' | 'TASK' | 'POLICY';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
}

export interface CollaborationComment {
  id: string;
  entityId: string;
  entityType: 'REGULATORY_CHANGE' | 'ASSESSMENT' | 'TASK' | 'POLICY';
  authorId: string;
  authorName: string;
  content: string;
  mentions: string[];
  attachments: string[];
  isEdited: boolean;
  editedAt?: Date;
  createdAt: Date;
  replies: CollaborationComment[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  assignedTo?: string;
  assignedToName?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED';
  dueDate?: Date;
  completedAt?: Date;
  notes?: string;
  dependencies: string[];
  checklist: Array<{
    item: string;
    completed: boolean;
    completedBy?: string;
    completedAt?: Date;
  }>;
}

export interface CollaborationWorkspace {
  id: string;
  regulatoryChangeId: string;
  name: string;
  description: string;
  teamMembers: Array<{
    userId: string;
    userName: string;
    role: string;
    permissions: string[];
  }>;
  workflow: WorkflowStep[];
  documents: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    uploadedBy: string;
    uploadedByName: string;
    uploadedAt: Date;
  }>;
  discussions: CollaborationComment[];
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CollaborationService {
  private readonly logger = new Logger(CollaborationService.name);
  private readonly notifications: Map<string, CollaborationNotification[]> = new Map();
  private readonly comments: Map<string, CollaborationComment[]> = new Map();
  private readonly workspaces: Map<string, CollaborationWorkspace> = new Map();
  private readonly teamMembers: Map<string, ComplianceTeam> = new Map();

  constructor(private readonly auditTrailService: AuditTrailService) {
    this.initializeTeamMembers();
  }

  private initializeTeamMembers(): void {
    // Initialize sample team members
    const teamMembers: ComplianceTeam[] = [
      {
        id: 'team_001',
        name: 'Sarah Johnson',
        email: 'sarah.johnson@stellara.com',
        role: 'Compliance Officer',
        department: 'Legal & Compliance',
        expertise: [ComplianceArea.AML, ComplianceArea.KYC, ComplianceArea.REPORTING],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'team_002',
        name: 'Michael Chen',
        email: 'michael.chen@stellara.com',
        role: 'Legal Counsel',
        department: 'Legal & Compliance',
        expertise: [ComplianceArea.LICENSING, ComplianceArea.CONSUMER_PROTECTION, ComplianceArea.MARKET_INTEGRITY],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'team_003',
        name: 'Emily Rodriguez',
        email: 'emily.rodriguez@stellara.com',
        role: 'Data Protection Officer',
        department: 'IT & Security',
        expertise: [ComplianceArea.PRIVACY, ComplianceArea.DATA_PROTECTION, ComplianceArea.RISK_MANAGEMENT],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    teamMembers.forEach(member => {
      this.teamMembers.set(member.id, member);
    });
  }

  async createWorkspace(
    regulatoryChangeId: string,
    regulatoryChange: RegulatoryChange,
    createdBy: string,
    createdByName: string
  ): Promise<CollaborationWorkspace> {
    this.logger.log(`Creating collaboration workspace for change ${regulatoryChangeId}`);

    // Determine relevant team members based on compliance areas
    const relevantTeamMembers = this.findRelevantTeamMembers(regulatoryChange.complianceAreas);

    const workspace: CollaborationWorkspace = {
      id: this.generateId(),
      regulatoryChangeId,
      name: `Compliance Workspace: ${regulatoryChange.title}`,
      description: `Collaborative workspace for managing compliance activities related to ${regulatoryChange.title}`,
      teamMembers: relevantTeamMembers.map(member => ({
        userId: member.id,
        userName: member.name,
        role: member.role,
        permissions: this.determinePermissions(member.expertise, regulatoryChange.complianceAreas),
      })),
      workflow: this.createDefaultWorkflow(regulatoryChange),
      documents: [],
      discussions: [],
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.workspaces.set(workspace.id, workspace);

    // Notify team members
    await this.notifyWorkspaceCreation(workspace, createdBy, createdByName);

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId,
      action: 'WORKSPACE_CREATED',
      actorId: createdBy,
      actorName: createdByName,
      actorRole: 'Compliance Manager',
      details: {
        workspaceId: workspace.id,
        teamMembers: relevantTeamMembers.length,
      },
    });

    return workspace;
  }

  async addComment(
    entityId: string,
    entityType: 'REGULATORY_CHANGE' | 'ASSESSMENT' | 'TASK' | 'POLICY',
    authorId: string,
    authorName: string,
    content: string,
    mentions?: string[]
  ): Promise<CollaborationComment> {
    const comment: CollaborationComment = {
      id: this.generateId(),
      entityId,
      entityType,
      authorId,
      authorName,
      content,
      mentions: mentions || [],
      attachments: [],
      isEdited: false,
      createdAt: new Date(),
      replies: [],
    };

    if (!this.comments.has(entityId)) {
      this.comments.set(entityId, []);
    }
    
    const entityComments = this.comments.get(entityId)!;
    entityComments.push(comment);

    // Notify mentioned users
    if (mentions && mentions.length > 0) {
      await this.notifyMentions(comment, mentions);
    }

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: entityId, // This would need to be adjusted based on entity type
      action: 'COMMENT_ADDED',
      actorId: authorId,
      actorName: authorName,
      actorRole: 'Team Member',
      details: {
        commentId: comment.id,
        entityType,
        mentions: mentions?.length || 0,
      },
    });

    return comment;
  }

  async assignTask(
    taskId: string,
    assigneeId: string,
    assigneeName: string,
    assignedBy: string,
    assignedByName: string,
    dueDate?: Date
  ): Promise<void> {
    // Create notification for assignee
    await this.createNotification({
      type: 'TASK_ASSIGNED',
      recipientId: assigneeId,
      recipientName: assigneeName,
      recipientEmail: this.getTeamMemberEmail(assigneeId),
      subject: 'New Task Assignment',
      message: `You have been assigned a new task. Due date: ${dueDate ? dueDate.toLocaleDateString() : 'No due date set'}`,
      relatedEntityId: taskId,
      relatedEntityType: 'TASK',
      priority: 'MEDIUM',
    });

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: taskId, // This would need to be adjusted
      action: 'TASK_ASSIGNED',
      actorId: assignedBy,
      actorName: assignedByName,
      actorRole: 'Compliance Manager',
      details: {
        taskId,
        assigneeId,
        assigneeName,
        dueDate,
      },
    });
  }

  async requestAssessment(
    regulatoryChangeId: string,
    regulatoryChange: RegulatoryChange,
    requestedBy: string,
    requestedByName: string
  ): Promise<void> {
    // Find relevant assessors
    const assessors = this.findRelevantAssessors(regulatoryChange.complianceAreas);

    for (const assessor of assessors) {
      await this.createNotification({
        type: 'ASSESSMENT_REQUIRED',
        recipientId: assessor.id,
        recipientName: assessor.name,
        recipientEmail: assessor.email,
        subject: 'Impact Assessment Required',
        message: `Impact assessment is required for regulatory change: ${regulatoryChange.title}`,
        relatedEntityId: regulatoryChangeId,
        relatedEntityType: 'REGULATORY_CHANGE',
        priority: regulatoryChange.relevanceScore > 0.8 ? 'HIGH' : 'MEDIUM',
      });
    }

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId,
      action: 'ASSESSMENT_REQUESTED',
      actorId: requestedBy,
      actorName: requestedByName,
      actorRole: 'Compliance Manager',
      details: {
        assessorsNotified: assessors.length,
        relevanceScore: regulatoryChange.relevanceScore,
      },
    });
  }

  async sendDeadlineReminders(): Promise<void> {
    const upcomingDeadlines = this.getUpcomingDeadlines(3); // 3 days ahead

    for (const deadline of upcomingDeadlines) {
      await this.createNotification({
        type: 'DEADLINE_REMINDER',
        recipientId: deadline.assigneeId,
        recipientName: deadline.assigneeName,
        recipientEmail: this.getTeamMemberEmail(deadline.assigneeId),
        subject: 'Deadline Reminder',
        message: `Task "${deadline.taskTitle}" is due on ${deadline.dueDate.toLocaleDateString()}`,
        relatedEntityId: deadline.taskId,
        relatedEntityType: 'TASK',
        priority: deadline.daysUntil <= 1 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  async getWorkspace(regulatoryChangeId: string): Promise<CollaborationWorkspace | undefined> {
    for (const workspace of this.workspaces.values()) {
      if (workspace.regulatoryChangeId === regulatoryChangeId) {
        return workspace;
      }
    }
    return undefined;
  }

  async getComments(entityId: string): Promise<CollaborationComment[]> {
    return this.comments.get(entityId) || [];
  }

  async getNotifications(userId: string): Promise<CollaborationNotification[]> {
    return this.notifications.get(userId) || [];
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    const userNotifications = this.notifications.get(userId);
    if (userNotifications) {
      const notification = userNotifications.find(n => n.id === notificationId);
      if (notification) {
        notification.isRead = true;
        notification.readAt = new Date();
      }
    }
  }

  async updateWorkflowStep(
    workspaceId: string,
    stepId: string,
    updates: Partial<WorkflowStep>,
    updatedBy: string,
    updatedByName: string
  ): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;

    const step = workspace.workflow.find(s => s.id === stepId);
    if (!step) return;

    Object.assign(step, updates);
    workspace.updatedAt = new Date();

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: workspace.regulatoryChangeId,
      action: 'WORKFLOW_UPDATED',
      actorId: updatedBy,
      actorName: updatedByName,
      actorRole: 'Team Member',
      details: {
        stepId,
        updates: Object.keys(updates),
      },
    });
  }

  private findRelevantTeamMembers(complianceAreas: string[]): ComplianceTeam[] {
    const relevantMembers: ComplianceTeam[] = [];

    for (const member of this.teamMembers.values()) {
      if (!member.isActive) continue;

      const hasRelevantExpertise = member.expertise.some(expertise =>
        complianceAreas.includes(expertise)
      );

      if (hasRelevantExpertise) {
        relevantMembers.push(member);
      }
    }

    return relevantMembers;
  }

  private findRelevantAssessors(complianceAreas: string[]): ComplianceTeam[] {
    return this.findRelevantTeamMembers(complianceAreas).filter(member =>
      member.role.includes('Compliance') || member.role.includes('Legal')
    );
  }

  private determinePermissions(expertise: string[], complianceAreas: string[]): string[] {
    const permissions = ['VIEW', 'COMMENT'];

    if (expertise.some(exp => complianceAreas.includes(exp))) {
      permissions.push('EDIT', 'ASSIGN_TASKS');
    }

    if (expertise.includes('AML') || expertise.includes('LICENSING')) {
      permissions.push('ASSESS', 'APPROVE');
    }

    return permissions;
  }

  private createDefaultWorkflow(regulatoryChange: RegulatoryChange): WorkflowStep[] {
    const baseSteps: WorkflowStep[] = [
      {
        id: 'initial_review',
        name: 'Initial Regulatory Review',
        description: 'Review and analyze the regulatory change',
        status: 'PENDING',
        dependencies: [],
        checklist: [
          { item: 'Review regulatory change details', completed: false },
          { item: 'Identify affected compliance areas', completed: false },
          { item: 'Determine initial impact level', completed: false },
        ],
      },
      {
        id: 'impact_assessment',
        name: 'Impact Assessment',
        description: 'Conduct detailed impact assessment',
        status: 'PENDING',
        dependencies: ['initial_review'],
        checklist: [
          { item: 'Complete assessment questionnaire', completed: false },
          { item: 'Identify required actions', completed: false },
          { item: 'Estimate implementation timeline', completed: false },
        ],
      },
      {
        id: 'task_generation',
        name: 'Task Generation',
        description: 'Generate and assign compliance tasks',
        status: 'PENDING',
        dependencies: ['impact_assessment'],
        checklist: [
          { item: 'Create compliance tasks', completed: false },
          { item: 'Assign tasks to team members', completed: false },
          { item: 'Set due dates and priorities', completed: false },
        ],
      },
      {
        id: 'policy_review',
        name: 'Policy Review',
        description: 'Review and update relevant policies',
        status: 'PENDING',
        dependencies: ['impact_assessment'],
        checklist: [
          { item: 'Identify affected policies', completed: false },
          { item: 'Draft policy updates', completed: false },
          { item: 'Review policy changes', completed: false },
        ],
      },
      {
        id: 'implementation',
        name: 'Implementation',
        description: 'Implement required changes',
        status: 'PENDING',
        dependencies: ['task_generation', 'policy_review'],
        checklist: [
          { item: 'Complete all compliance tasks', completed: false },
          { item: 'Update policies and procedures', completed: false },
          { item: 'Conduct training if required', completed: false },
        ],
      },
    ];

    // Add urgency-based steps for high-impact changes
    if (regulatoryChange.relevanceScore > 0.8) {
      baseSteps.unshift({
        id: 'urgent_review',
        name: 'Urgent Management Review',
        description: 'Immediate review by compliance management',
        status: 'PENDING',
        dependencies: [],
        checklist: [
          { item: 'Management notification', completed: false },
          { item: 'Urgent impact assessment', completed: false },
          { item: 'Immediate action plan', completed: false },
        ],
      });
    }

    return baseSteps;
  }

  private async createNotification(notification: Omit<CollaborationNotification, 'id' | 'isRead' | 'createdAt'>): Promise<void> {
    const fullNotification: CollaborationNotification = {
      id: this.generateId(),
      ...notification,
      isRead: false,
      createdAt: new Date(),
    };

    if (!this.notifications.has(notification.recipientId)) {
      this.notifications.set(notification.recipientId, []);
    }

    const userNotifications = this.notifications.get(notification.recipientId)!;
    userNotifications.push(fullNotification);

    this.logger.log(`Notification created for ${notification.recipientName}: ${notification.subject}`);
  }

  private async notifyWorkspaceCreation(
    workspace: CollaborationWorkspace,
    createdBy: string,
    createdByName: string
  ): Promise<void> {
    for (const member of workspace.teamMembers) {
      await this.createNotification({
        type: 'TASK_ASSIGNED',
        recipientId: member.userId,
        recipientName: member.userName,
        recipientEmail: this.getTeamMemberEmail(member.userId),
        subject: 'New Compliance Workspace',
        message: `You have been added to the compliance workspace: ${workspace.name}`,
        relatedEntityId: workspace.id,
        relatedEntityType: 'REGULATORY_CHANGE',
        priority: 'MEDIUM',
      });
    }
  }

  private async notifyMentions(comment: CollaborationComment, mentions: string[]): Promise<void> {
    for (const mentionedUserId of mentions) {
      const mentionedUser = this.teamMembers.get(mentionedUserId);
      if (mentionedUser) {
        await this.createNotification({
          type: 'TASK_ASSIGNED',
          recipientId: mentionedUserId,
          recipientName: mentionedUser.name,
          recipientEmail: mentionedUser.email,
          subject: 'You were mentioned in a comment',
          message: `${comment.authorName} mentioned you in a comment on ${comment.entityType}`,
          relatedEntityId: comment.entityId,
          relatedEntityType: comment.entityType,
          priority: 'LOW',
        });
      }
    }
  }

  private getUpcomingDeadlines(daysAhead: number): Array<{
    taskId: string;
    taskTitle: string;
    assigneeId: string;
    assigneeName: string;
    dueDate: Date;
    daysUntil: number;
  }> {
    // This would integrate with the compliance task service
    // For now, return empty array
    return [];
  }

  private getTeamMemberEmail(userId: string): string {
    const member = this.teamMembers.get(userId);
    return member?.email || '';
  }

  getTeamMembers(): ComplianceTeam[] {
    return Array.from(this.teamMembers.values());
  }

  getTeamMember(userId: string): ComplianceTeam | undefined {
    return this.teamMembers.get(userId);
  }

  private generateId(): string {
    return 'collab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
