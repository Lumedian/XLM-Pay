import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersonalizationRule, RuleStatus } from '../entities/personalization-rule.entity';
import { UserEvent } from '../entities/user-event.entity';

type EvaluationContext = {
  userId?: string | null;
  tenantId?: string | null;
  attributes?: Record<string, any>;
};

@Injectable()
export class RuleEngineService {
  constructor(
    @InjectRepository(PersonalizationRule)
    private readonly ruleRepo: Repository<PersonalizationRule>,
    @InjectRepository(UserEvent)
    private readonly eventRepo: Repository<UserEvent>,
  ) {}

  async createRule(input: {
    name: string;
    description?: string | null;
    priority?: number;
    status?: RuleStatus;
    conditions: any;
    actions: any;
    tenantId?: string | null;
  }): Promise<PersonalizationRule> {
    const rule = this.ruleRepo.create({
      name: input.name,
      description: input.description ?? null,
      priority: input.priority ?? 0,
      status: input.status ?? RuleStatus.ACTIVE,
      conditions: input.conditions,
      actions: input.actions,
      tenantId: input.tenantId ?? null,
    });
    return this.ruleRepo.save(rule);
  }

  async listRules(tenantId?: string | null): Promise<PersonalizationRule[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.ruleRepo.find({ where, order: { priority: 'DESC', createdAt: 'ASC' } });
  }

  async updateRule(id: string, patch: Partial<PersonalizationRule>): Promise<PersonalizationRule | null> {
    const r = await this.ruleRepo.findOne({ where: { id } });
    if (!r) return null;
    Object.assign(r, patch);
    return this.ruleRepo.save(r);
  }

  async deleteRule(id: string): Promise<boolean> {
    const res = await this.ruleRepo.delete({ id });
    return (res.affected ?? 0) > 0;
  }

  async evaluate(context: EvaluationContext): Promise<any[]> {
    const rules = await this.listRules(context.tenantId ?? null);
    for (const rule of rules) {
      if (rule.status !== RuleStatus.ACTIVE) continue;
      const ok = await this.evaluateConditions(rule.conditions, context);
      if (ok) return Array.isArray(rule.actions) ? rule.actions : [rule.actions];
    }
    return [];
    }

  private async evaluateConditions(conditions: any, context: EvaluationContext): Promise<boolean> {
    if (!conditions) return false;
    if (Array.isArray(conditions.all)) {
      for (const c of conditions.all) {
        const res = await this.evaluateCondition(c, context);
        if (!res) return false;
      }
      return true;
    }
    if (Array.isArray(conditions.any)) {
      for (const c of conditions.any) {
        if (await this.evaluateCondition(c, context)) return true;
      }
      return false;
    }
    return this.evaluateCondition(conditions, context);
  }

  private async evaluateCondition(cond: any, context: EvaluationContext): Promise<boolean> {
    if (!cond || typeof cond !== 'object') return false;
    if (cond.type === 'attribute') {
      const v = context.attributes?.[cond.key];
      return this.compare(v, cond.operator, cond.value);
    }
    if (cond.type === 'event_frequency') {
      const end = new Date();
      const start = new Date(end.getTime() - (cond.days ?? 30) * 24 * 60 * 60 * 1000);
      const qb = this.eventRepo
        .createQueryBuilder('e')
        .where('e.timestamp BETWEEN :start AND :end', { start, end });
      if (context.tenantId) qb.andWhere('e.tenantId = :tenantId', { tenantId: context.tenantId });
      if (context.userId) qb.andWhere('e.userId = :userId', { userId: context.userId });
      if (cond.eventType) qb.andWhere('e.eventType = :eventType', { eventType: cond.eventType });
      if (cond.itemId) qb.andWhere('e.itemId = :itemId', { itemId: cond.itemId });
      const count = await qb.getCount();
      return this.compare(count, cond.operator ?? '>=', cond.threshold ?? 1);
    }
    return false;
  }

  private compare(a: any, op: string, b: any): boolean {
    switch (op) {
      case '==':
        return a == b;
      case '===':
        return a === b;
      case '!=':
        return a != b;
      case '!==':
        return a !== b;
      case '>':
        return Number(a) > Number(b);
      case '>=':
        return Number(a) >= Number(b);
      case '<':
        return Number(a) < Number(b);
      case '<=':
        return Number(a) <= Number(b);
      case 'in':
        return Array.isArray(b) && b.includes(a);
      default:
        return false;
    }
  }
}
