import { RuleEngineService } from './services/rule-engine.service';
import { Repository } from 'typeorm';
import { PersonalizationRule, RuleStatus } from './entities/personalization-rule.entity';
import { UserEvent } from './entities/user-event.entity';

describe('RuleEngineService', () => {
  let service: RuleEngineService;
  let ruleRepo: Partial<Repository<PersonalizationRule>>;
  let eventRepo: Partial<Repository<UserEvent>>;

  beforeEach(() => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(5),
    };

    ruleRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'r1',
          name: 'Frequent viewer promo',
          description: null,
          status: RuleStatus.ACTIVE,
          priority: 10,
          conditions: { type: 'event_frequency', eventType: 'view', operator: '>=', threshold: 2, days: 30 },
          actions: [{ type: 'show_banner', bannerId: 'promo-123' }],
          tenantId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]),
    };

    eventRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    service = new RuleEngineService(ruleRepo as any, eventRepo as any);
  });

  it('evaluates rules and returns actions when conditions pass', async () => {
    const actions = await service.evaluate({ userId: 'u1', tenantId: null, attributes: {} });
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: 'show_banner', bannerId: 'promo-123' });
  });
});

