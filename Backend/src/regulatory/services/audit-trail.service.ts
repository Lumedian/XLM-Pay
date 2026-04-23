import { Injectable, Logger } from '@nestjs/common';
import { AuditTrailEntry } from '../interfaces/regulatory.interface';

export interface AuditLogAction {
  regulatoryChangeId: string;
  action: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  details: any;
  previousState?: any;
  newState?: any;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);
  private readonly auditLogs: Map<string, AuditTrailEntry[]> = new Map();

  async logAction(action: AuditLogAction): Promise<AuditTrailEntry> {
    const entry: AuditTrailEntry = {
      id: this.generateId(),
      regulatoryChangeId: action.regulatoryChangeId,
      action: action.action,
      actorId: action.actorId,
      actorName: action.actorName,
      actorRole: action.actorRole,
      details: action.details,
      previousState: action.previousState,
      newState: action.newState,
      ipAddress: action.ipAddress,
      userAgent: action.userAgent,
      timestamp: new Date(),
    };

    // Store in memory (in production, this would be in a database)
    if (!this.auditLogs.has(action.regulatoryChangeId)) {
      this.auditLogs.set(action.regulatoryChangeId, []);
    }
    
    const logs = this.auditLogs.get(action.regulatoryChangeId)!;
    logs.push(entry);

    this.logger.log(`Audit trail entry created: ${action.action} by ${action.actorName} for change ${action.regulatoryChangeId}`);

    return entry;
  }

  async getAuditTrail(regulatoryChangeId: string): Promise<AuditTrailEntry[]> {
    const logs = this.auditLogs.get(regulatoryChangeId) || [];
    
    // Return sorted by timestamp (newest first)
    return [...logs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getAuditTrailByActor(actorId: string): Promise<AuditTrailEntry[]> {
    const allLogs: AuditTrailEntry[] = [];
    
    for (const logs of this.auditLogs.values()) {
      allLogs.push(...logs.filter(log => log.actorId === actorId));
    }
    
    return allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getAuditTrailByAction(action: string): Promise<AuditTrailEntry[]> {
    const allLogs: AuditTrailEntry[] = [];
    
    for (const logs of this.auditLogs.values()) {
      allLogs.push(...logs.filter(log => log.action === action));
    }
    
    return allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async searchAuditTrail(criteria: {
    regulatoryChangeId?: string;
    actorId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<AuditTrailEntry[]> {
    let logs: AuditTrailEntry[] = [];

    // Get all logs or specific change logs
    if (criteria.regulatoryChangeId) {
      logs = this.auditLogs.get(criteria.regulatoryChangeId) || [];
    } else {
      for (const changeLogs of this.auditLogs.values()) {
        logs.push(...changeLogs);
      }
    }

    // Apply filters
    if (criteria.actorId) {
      logs = logs.filter(log => log.actorId === criteria.actorId);
    }

    if (criteria.action) {
      logs = logs.filter(log => log.action === criteria.action);
    }

    if (criteria.startDate) {
      logs = logs.filter(log => log.timestamp >= criteria.startDate!);
    }

    if (criteria.endDate) {
      logs = logs.filter(log => log.timestamp <= criteria.endDate!);
    }

    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async generateAuditReport(regulatoryChangeId: string): Promise<{
    summary: {
      totalActions: number;
      uniqueActors: number;
      actionTypes: Record<string, number>;
      timeline: Array<{ date: string; actions: number }>;
    };
    entries: AuditTrailEntry[];
  }> {
    const entries = await this.getAuditTrail(regulatoryChangeId);
    
    const summary = {
      totalActions: entries.length,
      uniqueActors: new Set(entries.map(e => e.actorId)).size,
      actionTypes: entries.reduce((acc, entry) => {
        acc[entry.action] = (acc[entry.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      timeline: this.generateTimeline(entries),
    };

    return { summary, entries };
  }

  private generateTimeline(entries: AuditTrailEntry[]): Array<{ date: string; actions: number }> {
    const timeline: Record<string, number> = {};
    
    entries.forEach(entry => {
      const date = entry.timestamp.toISOString().split('T')[0];
      timeline[date] = (timeline[date] || 0) + 1;
    });

    return Object.entries(timeline)
      .map(([date, actions]) => ({ date, actions }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private generateId(): string {
    return 'audit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
