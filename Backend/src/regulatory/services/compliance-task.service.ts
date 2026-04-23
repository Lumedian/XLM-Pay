import { Injectable, Logger } from '@nestjs/common';
import { ComplianceTask, TaskStatus, TaskPriority, ComplianceArea } from '../interfaces/regulatory.interface';
import { CreateComplianceTaskDto } from '../dto/create-regulatory-change.dto';
import { AuditTrailService } from './audit-trail.service';

export interface TaskMetrics {
  totalTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  overdueTasks: number;
  averageCompletionTime: number; // hours
  tasksByPriority: Record<TaskPriority, number>;
  tasksByComplianceArea: Record<ComplianceArea, number>;
  workloadByAssignee: Record<string, number>;
}

export interface TaskDependency {
  taskId: string;
  dependsOn: string;
  dependencyType: 'FINISH_TO_START' | 'START_TO_START' | 'FINISH_TO_FINISH';
}

@Injectable()
export class ComplianceTaskService {
  private readonly logger = new Logger(ComplianceTaskService.name);
  private readonly tasks: Map<string, ComplianceTask> = new Map();
  private readonly dependencies: Map<string, TaskDependency[]> = new Map();

  constructor(private readonly auditTrailService: AuditTrailService) {}

  async createTask(createTaskDto: CreateComplianceTaskDto): Promise<ComplianceTask> {
    this.logger.log(`Creating compliance task: ${createTaskDto.title}`);

    const task: ComplianceTask = {
      id: this.generateId(),
      regulatoryChangeId: createTaskDto.regulatoryChangeId,
      title: createTaskDto.title,
      description: createTaskDto.description,
      complianceArea: createTaskDto.complianceArea,
      assignedTo: createTaskDto.assignedTo,
      assignedToName: createTaskDto.assignedToName,
      status: createTaskDto.status || TaskStatus.PENDING,
      priority: createTaskDto.priority || TaskPriority.MEDIUM,
      dueDate: createTaskDto.dueDate,
      estimatedHours: createTaskDto.estimatedHours,
      dependencies: createTaskDto.dependencies,
      checklist: createTaskDto.checklist,
      notes: createTaskDto.notes,
      attachments: createTaskDto.attachments,
      createdBy: createTaskDto.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tasks.set(task.id, task);

    // Store dependencies if any
    if (createTaskDto.dependencies && createTaskDto.dependencies.length > 0) {
      const taskDeps: TaskDependency[] = createTaskDto.dependencies.map(depId => ({
        taskId: task.id,
        dependsOn: depId,
        dependencyType: 'FINISH_TO_START',
      }));
      this.dependencies.set(task.id, taskDeps);
    }

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: task.regulatoryChangeId,
      action: 'TASK_CREATED',
      actorId: createTaskDto.createdBy,
      actorName: createTaskDto.assignedToName || 'System',
      actorRole: 'Compliance Officer',
      details: {
        taskId: task.id,
        title: task.title,
        complianceArea: task.complianceArea,
        priority: task.priority,
        dueDate: task.dueDate,
      },
    });

    return task;
  }

  async updateTask(
    taskId: string,
    updates: Partial<ComplianceTask>,
    updatedBy: string,
    updatedByName: string
  ): Promise<ComplianceTask | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    const previousState = { ...task };

    // Update task properties
    Object.assign(task, updates);
    task.updatedAt = new Date();

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: task.regulatoryChangeId,
      action: 'TASK_UPDATED',
      actorId: updatedBy,
      actorName: updatedByName,
      actorRole: 'Compliance Officer',
      details: {
        taskId,
        updates: Object.keys(updates),
      },
      previousState,
      newState: { ...task },
    });

    return task;
  }

  async assignTask(
    taskId: string,
    assignedTo: string,
    assignedToName: string,
    assignedBy: string,
    assignedByName: string
  ): Promise<ComplianceTask | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    const previousState = { ...task };

    task.assignedTo = assignedTo;
    task.assignedToName = assignedToName;
    task.status = TaskStatus.PENDING;
    task.updatedAt = new Date();

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: task.regulatoryChangeId,
      action: 'TASK_ASSIGNED',
      actorId: assignedBy,
      actorName: assignedByName,
      actorRole: 'Compliance Manager',
      details: {
        taskId,
        assignedTo,
        assignedToName,
      },
      previousState,
      newState: { ...task },
    });

    return task;
  }

  async startTask(taskId: string, startedBy: string, startedByName: string): Promise<ComplianceTask | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    // Check if dependencies are completed
    const canStart = await this.checkDependencies(taskId);
    if (!canStart) {
      throw new Error('Task dependencies are not completed');
    }

    task.status = TaskStatus.IN_PROGRESS;
    task.updatedAt = new Date();

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: task.regulatoryChangeId,
      action: 'TASK_STARTED',
      actorId: startedBy,
      actorName: startedByName,
      actorRole: task.assignedToName || 'Team Member',
      details: { taskId },
    });

    return task;
  }

  async completeTask(
    taskId: string,
    completionNotes?: string,
    actualHours?: number,
    completedBy?: string,
    completedByName?: string
  ): Promise<ComplianceTask | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    task.status = TaskStatus.COMPLETED;
    task.completedAt = new Date();
    if (actualHours !== undefined) {
      task.actualHours = actualHours;
    }
    if (completionNotes) {
      task.notes = [...(task.notes || []), completionNotes];
    }
    task.updatedAt = new Date();

    // Log to audit trail
    await this.auditTrailService.logAction({
      regulatoryChangeId: task.regulatoryChangeId,
      action: 'TASK_COMPLETED',
      actorId: completedBy || task.assignedTo || 'system',
      actorName: completedByName || task.assignedToName || 'System',
      actorRole: 'Team Member',
      details: {
        taskId,
        actualHours,
        completionNotes,
      },
    });

    // Check if this completion enables other tasks
    await this.checkAndEnableDependentTasks(taskId);

    return task;
  }

  async getTasksByRegulatoryChange(regulatoryChangeId: string): Promise<ComplianceTask[]> {
    return Array.from(this.tasks.values()).filter(
      task => task.regulatoryChangeId === regulatoryChangeId
    );
  }

  async getTasksByAssignee(assigneeId: string): Promise<ComplianceTask[]> {
    return Array.from(this.tasks.values()).filter(
      task => task.assignedTo === assigneeId
    );
  }

  async getTasksByStatus(status: TaskStatus): Promise<ComplianceTask[]> {
    return Array.from(this.tasks.values()).filter(
      task => task.status === status
    );
  }

  async getTasksByPriority(priority: TaskPriority): Promise<ComplianceTask[]> {
    return Array.from(this.tasks.values()).filter(
      task => task.priority === priority
    );
  }

  async getTasksByComplianceArea(complianceArea: ComplianceArea): Promise<ComplianceTask[]> {
    return Array.from(this.tasks.values()).filter(
      task => task.complianceArea === complianceArea
    );
  }

  async getOverdueTasks(): Promise<ComplianceTask[]> {
    const now = new Date();
    return Array.from(this.tasks.values()).filter(
      task => task.dueDate && 
               task.dueDate < now && 
               task.status !== TaskStatus.COMPLETED &&
               task.status !== TaskStatus.CANCELLED
    );
  }

  async getUpcomingTasks(days: number = 7): Promise<ComplianceTask[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    const now = new Date();
    return Array.from(this.tasks.values()).filter(
      task => task.dueDate && 
               task.dueDate >= now && 
               task.dueDate <= futureDate &&
               task.status !== TaskStatus.COMPLETED &&
               task.status !== TaskStatus.CANCELLED
    );
  }

  async generateTasksFromAssessment(
    regulatoryChangeId: string,
    assessment: any,
    createdBy: string
  ): Promise<ComplianceTask[]> {
    const tasks: ComplianceTask[] = [];

    // Generate tasks based on impact level and required actions
    if (assessment.impactLevel === 'CRITICAL' || assessment.impactLevel === 'HIGH') {
      // Create urgent compliance tasks
      const urgentTask = await this.createTask({
        regulatoryChangeId,
        title: `Urgent Compliance Review - ${assessment.impactSummary}`,
        description: `Immediate review required due to ${assessment.impactLevel.toLowerCase()} impact level`,
        complianceArea: assessment.complianceArea,
        priority: TaskPriority.URGENT,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        estimatedHours: 8,
        createdBy,
      });
      tasks.push(urgentTask);
    }

    // Create tasks for each required action
    for (const action of assessment.requiredActions || []) {
      const task = await this.createTask({
        regulatoryChangeId,
        title: action,
        description: `Implementation task for: ${action}`,
        complianceArea: assessment.complianceArea,
        priority: this.determineTaskPriority(assessment.impactLevel),
        dueDate: this.calculateDueDate(assessment.estimatedTimeline),
        estimatedHours: this.estimateTaskHours(action),
        createdBy,
      });
      tasks.push(task);
    }

    return tasks;
  }

  async getTaskMetrics(filters?: {
    regulatoryChangeId?: string;
    assigneeId?: string;
    complianceArea?: ComplianceArea;
    startDate?: Date;
    endDate?: Date;
  }): Promise<TaskMetrics> {
    let tasks = Array.from(this.tasks.values());

    // Apply filters
    if (filters) {
      if (filters.regulatoryChangeId) {
        tasks = tasks.filter(task => task.regulatoryChangeId === filters.regulatoryChangeId);
      }
      if (filters.assigneeId) {
        tasks = tasks.filter(task => task.assignedTo === filters.assigneeId);
      }
      if (filters.complianceArea) {
        tasks = tasks.filter(task => task.complianceArea === filters.complianceArea);
      }
      if (filters.startDate) {
        tasks = tasks.filter(task => task.createdAt >= filters.startDate!);
      }
      if (filters.endDate) {
        tasks = tasks.filter(task => task.createdAt <= filters.endDate!);
      }
    }

    const completedTasks = tasks.filter(task => task.status === TaskStatus.COMPLETED);
    const overdueTasks = await this.getOverdueTasks();

    // Calculate average completion time
    const completionTimes = completedTasks
      .filter(task => task.completedAt)
      .map(task => (task.completedAt!.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60)); // hours

    const averageCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length
      : 0;

    // Calculate metrics by category
    const tasksByPriority = tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {} as Record<TaskPriority, number>);

    const tasksByComplianceArea = tasks.reduce((acc, task) => {
      acc[task.complianceArea] = (acc[task.complianceArea] || 0) + 1;
      return acc;
    }, {} as Record<ComplianceArea, number>);

    const workloadByAssignee = tasks.reduce((acc, task) => {
      if (task.assignedTo) {
        acc[task.assignedTo] = (acc[task.assignedTo] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(task => task.status === TaskStatus.PENDING).length,
      inProgressTasks: tasks.filter(task => task.status === TaskStatus.IN_PROGRESS).length,
      completedTasks: completedTasks.length,
      overdueTasks: overdueTasks.length,
      averageCompletionTime,
      tasksByPriority,
      tasksByComplianceArea,
      workloadByAssignee,
    };
  }

  private async checkDependencies(taskId: string): Promise<boolean> {
    const deps = this.dependencies.get(taskId);
    if (!deps || deps.length === 0) {
      return true;
    }

    for (const dep of deps) {
      const depTask = this.tasks.get(dep.dependsOn);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        return false;
      }
    }

    return true;
  }

  private async checkAndEnableDependentTasks(completedTaskId: string): Promise<void> {
    // Find tasks that depend on the completed task
    for (const [taskId, deps] of this.dependencies) {
      const hasDependency = deps.some(dep => dep.dependsOn === completedTaskId);
      if (hasDependency) {
        const task = this.tasks.get(taskId);
        if (task && task.status === TaskStatus.PENDING) {
          // Check if all dependencies are now completed
          const canStart = await this.checkDependencies(taskId);
          if (canStart) {
            // Notify that task is ready to start
            this.logger.log(`Task ${task.title} is now ready to start`);
          }
        }
      }
    }
  }

  private determineTaskPriority(impactLevel: string): TaskPriority {
    switch (impactLevel) {
      case 'CRITICAL':
        return TaskPriority.URGENT;
      case 'HIGH':
        return TaskPriority.HIGH;
      case 'MEDIUM':
        return TaskPriority.MEDIUM;
      case 'LOW':
      case 'MINIMAL':
        return TaskPriority.LOW;
      default:
        return TaskPriority.MEDIUM;
    }
  }

  private calculateDueDate(estimatedTimeline?: number): Date {
    if (!estimatedTimeline) {
      // Default to 30 days from now
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    // Set due date to 75% of estimated timeline
    const dueDateMs = Date.now() + (estimatedTimeline * 0.75 * 24 * 60 * 60 * 1000);
    return new Date(dueDateMs);
  }

  private estimateTaskHours(action: string): number {
    const actionLower = action.toLowerCase();

    if (actionLower.includes('review') || actionLower.includes('assessment')) {
      return 8;
    } else if (actionLower.includes('implement') || actionLower.includes('develop')) {
      return 40;
    } else if (actionLower.includes('report') || actionLower.includes('documentation')) {
      return 16;
    } else if (actionLower.includes('meeting') || actionLower.includes('consultation')) {
      return 4;
    } else {
      return 12; // Default estimate
    }
  }

  private generateId(): string {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
