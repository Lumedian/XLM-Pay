import { ExperimentService } from './services/experiment.service';
import { Repository } from 'typeorm';
import { Experiment, ExperimentStatus } from './entities/experiment.entity';
import { ExperimentAssignment } from './entities/experiment-assignment.entity';

describe('ExperimentService', () => {
  let service: ExperimentService;
  let expRepo: Partial<Repository<Experiment>>;
  let assignRepo: Partial<Repository<ExperimentAssignment>>;
  let eventRepo: any;

  beforeEach(() => {
    const experiment: Experiment = {
      id: 'e1',
      key: 'homepage_test',
      name: 'Homepage CTA Test',
      description: null,
      status: ExperimentStatus.RUNNING,
      variants: [
        { name: 'control', weight: 1 },
        { name: 'variant', weight: 1 },
      ],
      tenantId: null,
      startAt: new Date(),
      endAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expRepo = {
      findOne: jest.fn().mockResolvedValue(experiment),
    };

    const savedAssignments: ExperimentAssignment[] = [];
    assignRepo = {
      findOne: jest.fn().mockImplementation(async ({ where }: any) => savedAssignments.find(a => a.experimentKey === where.experimentKey && a.userId === where.userId) || null),
      save: jest.fn().mockImplementation(async (a: any) => {
        const assignment = { ...a, id: 'a1', assignedAt: new Date() } as ExperimentAssignment;
        savedAssignments.push(assignment);
        return assignment;
      }),
    };

    const qb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { variant: 'control', impressions: '100', clicks: '20', purchases: '5' },
        { variant: 'variant', impressions: '120', clicks: '30', purchases: '9' },
      ]),
    };
    eventRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    service = new ExperimentService(expRepo as any, assignRepo as any, eventRepo as any);
  });

  it('assigns a deterministic variant to a user', async () => {
    const assignment = await service.assignVariant({ experimentKey: 'homepage_test', userId: 'user-123' });
    expect(assignment).toBeTruthy();
    expect(['control', 'variant']).toContain(assignment!.variant);
  });

  it('returns a simple experiment report with CTR and conversion', async () => {
    const report = await service.getReport('homepage_test');
    expect(report).toBeTruthy();
    expect(report!.experimentKey).toBe('homepage_test');
    expect(report!.variants.length).toBe(2);
    const control = report!.variants.find(v => v.name === 'control')!;
    expect(control.impressions).toBe(100);
    expect(control.clicks).toBe(20);
    expect(control.purchases).toBe(5);
    expect(control.ctr).toBeCloseTo(0.2);
    expect(control.conversionRate).toBeCloseTo(0.25);
  });
});
