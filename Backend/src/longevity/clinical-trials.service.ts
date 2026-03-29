import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma.service';
import { TrialStatus, TrialPhase } from '@prisma/client';
import { ClinicalTrialRecord } from './interfaces/longevity.interfaces';

/**
 * Key longevity intervention terms to track.
 * Covers the 100+ trial requirement from the acceptance criteria.
 */
const LONGEVITY_INTERVENTIONS = [
  'metformin',
  'rapamycin',
  'senolytics',
  'dasatinib',
  'quercetin',
  'navitoclax',
  'fisetin',
  'resveratrol',
  'NAD',
  'nicotinamide riboside',
  'NMN',
  'caloric restriction',
  'intermittent fasting',
  'glycine',
  'spermidine',
  'alpha-ketoglutarate',
  'young plasma',
  'stem cells aging',
  'telomerase',
  'GDF11',
  'klotho',
  'FOXO3',
  'acarbose',
  '17-alpha estradiol',
  'canagliflozin',
];

/** ClinicalTrials.gov v2 REST API base URL */
const CTGOV_BASE = 'https://clinicaltrials.gov/api/v2';

@Injectable()
export class ClinicalTrialsService {
  private readonly logger = new Logger(ClinicalTrialsService.name);

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Sync clinical trials from ClinicalTrials.gov for all tracked interventions.
   * Targets 100+ trials across metformin, rapamycin, senolytics and related compounds.
   */
  async syncTrials(): Promise<number> {
    this.logger.log('Starting ClinicalTrials.gov sync');
    let totalSynced = 0;

    for (const intervention of LONGEVITY_INTERVENTIONS) {
      try {
        const trials = await this.fetchTrialsForIntervention(intervention);
        for (const trial of trials) {
          await this.upsertTrial(trial);
          totalSynced++;
        }
        this.logger.debug(`Synced ${trials.length} trials for "${intervention}"`);
      } catch (err) {
        this.logger.error(`Failed to sync trials for "${intervention}": ${err.message}`);
      }
    }

    this.logger.log(`ClinicalTrials.gov sync complete. Total: ${totalSynced}`);
    return totalSynced;
  }

  async findAll(filters: {
    intervention?: string;
    status?: string;
    phase?: string;
    page?: number;
    limit?: number;
  }) {
    const { intervention, status, phase, page = 1, limit = 20 } = filters;

    const where: any = {};
    if (intervention) {
      where.intervention = { contains: intervention, mode: 'insensitive' };
    }
    if (status) {
      where.status = status as TrialStatus;
    }
    if (phase) {
      where.phase = phase as TrialPhase;
    }

    const [data, total] = await Promise.all([
      this.prisma.clinicalTrial.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastSynced: 'desc' },
      }),
      this.prisma.clinicalTrial.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    return this.prisma.clinicalTrial.findUnique({ where: { id } });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async fetchTrialsForIntervention(
    intervention: string,
    pageSize = 5,
  ): Promise<ClinicalTrialRecord[]> {
    const params = {
      'query.intr': intervention,
      'query.cond': 'aging OR longevity OR lifespan',
      pageSize,
      format: 'json',
    };

    const response = await firstValueFrom(
      this.http.get<any>(`${CTGOV_BASE}/studies`, {
        params,
        timeout: 15000,
      }),
    );

    const studies = response.data?.studies ?? [];
    return studies.map((s: any) => this.mapStudyToRecord(s, intervention));
  }

  private mapStudyToRecord(study: any, intervention: string): ClinicalTrialRecord {
    const protocol = study.protocolSection ?? {};
    const id = protocol.identificationModule ?? {};
    const status = protocol.statusModule ?? {};
    const design = protocol.designModule ?? {};
    const eligibility = protocol.eligibilityModule ?? {};
    const conditions = protocol.conditionsModule ?? {};
    const interventions = protocol.armsInterventionsModule ?? {};
    const outcomes = protocol.outcomesModule ?? {};
    const sponsor = protocol.sponsorCollaboratorsModule ?? {};

    return {
      nctId: id.nctId ?? '',
      briefTitle: id.briefTitle ?? id.officialTitle ?? '',
      officialTitle: id.officialTitle,
      overallStatus: status.overallStatus ?? 'UNKNOWN',
      phase: (design.phases ?? [])[0] ?? null,
      conditions: conditions.conditions ?? [],
      interventions: (interventions.interventions ?? []).map((i: any) => ({
        type: i.type,
        name: i.name,
      })),
      startDate: status.startDateStruct?.date,
      completionDate: status.completionDateStruct?.date,
      enrollment: design.enrollmentInfo?.count,
      sponsor: sponsor.leadSponsor?.name,
      primaryOutcomes: (outcomes.primaryOutcomes ?? []).map((o: any) => ({
        measure: o.measure,
        description: o.description,
      })),
    };
  }

  private async upsertTrial(record: ClinicalTrialRecord): Promise<void> {
    if (!record.nctId) return;

    const statusMap: Record<string, TrialStatus> = {
      'NOT YET RECRUITING': TrialStatus.NOT_YET_RECRUITING,
      RECRUITING: TrialStatus.RECRUITING,
      'ENROLLING BY INVITATION': TrialStatus.ENROLLING_BY_INVITATION,
      'ACTIVE, NOT RECRUITING': TrialStatus.ACTIVE_NOT_RECRUITING,
      COMPLETED: TrialStatus.COMPLETED,
      SUSPENDED: TrialStatus.SUSPENDED,
      TERMINATED: TrialStatus.TERMINATED,
      WITHDRAWN: TrialStatus.WITHDRAWN,
    };

    const phaseMap: Record<string, TrialPhase> = {
      'PHASE1': TrialPhase.PHASE1,
      'PHASE2': TrialPhase.PHASE2,
      'PHASE3': TrialPhase.PHASE3,
      'PHASE4': TrialPhase.PHASE4,
      'NA': TrialPhase.NOT_APPLICABLE,
    };

    const status = statusMap[record.overallStatus?.toUpperCase()] ?? TrialStatus.UNKNOWN;
    const phaseKey = record.phase?.replace('PHASE_', '').replace(' ', '') ?? null;
    const phase = phaseKey ? (phaseMap[phaseKey] ?? null) : null;
    const interventionName =
      record.interventions.find((i) => i.type === 'DRUG')?.name ??
      record.interventions[0]?.name ??
      record.briefTitle.split(' ').slice(0, 3).join(' ');

    await this.prisma.clinicalTrial.upsert({
      where: { trialId: record.nctId },
      create: {
        trialId: record.nctId,
        title: record.briefTitle,
        sponsor: record.sponsor ?? null,
        phase,
        status,
        intervention: interventionName,
        condition: record.conditions.join(', ') || 'aging',
        startDate: record.startDate ? new Date(record.startDate) : null,
        estimatedCompletion: record.completionDate ? new Date(record.completionDate) : null,
        enrollment: record.enrollment ?? null,
        primaryEndpoint: record.primaryOutcomes?.[0]?.measure ?? null,
        sourceUrl: record.nctId
          ? `https://clinicaltrials.gov/study/${record.nctId}`
          : null,
        lastSynced: new Date(),
      },
      update: {
        status,
        phase,
        enrollment: record.enrollment ?? null,
        lastSynced: new Date(),
      },
    });
  }
}
