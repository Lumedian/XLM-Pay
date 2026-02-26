import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Experiment, ExperimentStatus } from '../entities/experiment.entity';
import { ExperimentAssignment } from '../entities/experiment-assignment.entity';
import { UserEvent, UserEventType } from '../entities/user-event.entity';

@Injectable()
export class ExperimentService {
  constructor(
    @InjectRepository(Experiment)
    private readonly expRepo: Repository<Experiment>,
    @InjectRepository(ExperimentAssignment)
    private readonly assignRepo: Repository<ExperimentAssignment>,
    @InjectRepository(UserEvent)
    private readonly eventRepo: Repository<UserEvent>,
  ) {}

  async createExperiment(input: {
    key: string;
    name: string;
    description?: string | null;
    variants: Array<{ name: string; weight: number }>;
    tenantId?: string | null;
  }): Promise<Experiment> {
    const exp = this.expRepo.create({
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      status: ExperimentStatus.DRAFT,
      variants: input.variants,
      tenantId: input.tenantId ?? null,
      startAt: null,
      endAt: null,
    });
    return this.expRepo.save(exp);
  }

  async listExperiments(tenantId?: string | null): Promise<Experiment[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.expRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async updateExperiment(
    key: string,
    patch: Partial<Experiment>,
  ): Promise<Experiment | null> {
    const exp = await this.expRepo.findOne({ where: { key } });
    if (!exp) return null;
    Object.assign(exp, patch);
    return this.expRepo.save(exp);
  }

  async startExperiment(key: string): Promise<Experiment | null> {
    const exp = await this.expRepo.findOne({ where: { key } });
    if (!exp) return null;
    exp.status = ExperimentStatus.RUNNING;
    exp.startAt = new Date();
    return this.expRepo.save(exp);
  }

  async pauseExperiment(key: string): Promise<Experiment | null> {
    const exp = await this.expRepo.findOne({ where: { key } });
    if (!exp) return null;
    exp.status = ExperimentStatus.PAUSED;
    return this.expRepo.save(exp);
  }

  async assignVariant(params: {
    experimentKey: string;
    userId: string;
    tenantId?: string | null;
  }): Promise<ExperimentAssignment | null> {
    const exp = await this.expRepo.findOne({
      where: { key: params.experimentKey },
    });
    if (!exp || exp.status !== ExperimentStatus.RUNNING) return null;
    const existing = await this.assignRepo.findOne({
      where: { experimentKey: exp.key, userId: params.userId },
    });
    if (existing) return existing;
    const variant = this.selectVariantDeterministic(
      params.userId,
      exp.variants,
    );
    const assignment = this.assignRepo.create({
      experimentKey: exp.key,
      tenantId: params.tenantId ?? exp.tenantId ?? null,
      userId: params.userId,
      variant,
    });
    return this.assignRepo.save(assignment);
  }

  async getAssignment(
    experimentKey: string,
    userId: string,
  ): Promise<ExperimentAssignment | null> {
    return this.assignRepo.findOne({ where: { experimentKey, userId } });
  }

  async getReport(experimentKey: string): Promise<{
    experimentKey: string;
    variants: Array<{
      name: string;
      impressions: number;
      clicks: number;
      purchases: number;
      ctr: number;
      conversionRate: number;
    }>;
  } | null> {
    const exp = await this.expRepo.findOne({ where: { key: experimentKey } });
    if (!exp) return null;
    const variants = exp.variants.map((v) => v.name);
    const rows = await this.eventRepo
      .createQueryBuilder('e')
      .select(['e.variant AS variant'])
      .addSelect(
        `SUM(CASE WHEN e.eventType = :view THEN 1 ELSE 0 END)`,
        'impressions',
      )
      .addSelect(
        `SUM(CASE WHEN e.eventType = :click THEN 1 ELSE 0 END)`,
        'clicks',
      )
      .addSelect(
        `SUM(CASE WHEN e.eventType = :purchase THEN 1 ELSE 0 END)`,
        'purchases',
      )
      .where('e.experimentId = :experimentKey', { experimentKey })
      .groupBy('e.variant')
      .setParameters({
        view: UserEventType.VIEW,
        click: UserEventType.CLICK,
        purchase: UserEventType.PURCHASE,
      })
      .getRawMany<{
        variant: string;
        impressions: string;
        clicks: string;
        purchases: string;
      }>();
    const byVariant = new Map<
      string,
      { impressions: number; clicks: number; purchases: number }
    >();
    for (const r of rows) {
      const v = r.variant || 'unknown';
      byVariant.set(v, {
        impressions: parseInt(r.impressions || '0', 10),
        clicks: parseInt(r.clicks || '0', 10),
        purchases: parseInt(r.purchases || '0', 10),
      });
    }
    const out = variants.map((name) => {
      const v = byVariant.get(name) || {
        impressions: 0,
        clicks: 0,
        purchases: 0,
      };
      const ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
      const conversionRate = v.clicks > 0 ? v.purchases / v.clicks : 0;
      return {
        name,
        impressions: v.impressions,
        clicks: v.clicks,
        purchases: v.purchases,
        ctr,
        conversionRate,
      };
    });
    return { experimentKey, variants: out };
  }

  private selectVariantDeterministic(
    userId: string,
    variants: Array<{ name: string; weight: number }>,
  ): string {
    const total = variants.reduce((s, v) => s + v.weight, 0);
    const normalized = variants.map((v) => ({
      name: v.name,
      weight: v.weight / total,
    }));
    let x = this.hashToUnit(userId);
    for (const v of normalized) {
      if (x < v.weight) return v.name;
      x -= v.weight;
    }
    return normalized[normalized.length - 1].name;
  }

  private hashToUnit(input: string): number {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const u = (h >>> 0) / 4294967295;
    return u;
  }
}
