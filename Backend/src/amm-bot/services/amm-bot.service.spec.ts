import { Test, TestingModule } from '@nestjs/testing';
import { AmmBotService } from './amm-bot.service';
import { RiskConfigService } from '../config/risk-config.service';
import { StrategyFactory } from '../strategies/strategy.factory';
import { DexFactory } from '../integrations/dex.factory';
import { RebalancingService } from './rebalancing.service';
import { DashboardService } from '../analytics/dashboard.service';
import { CreateBotDto } from '../dto/create-bot.dto';
import { StrategyType, BotStatus, DexType } from '../interfaces/amm-bot.interface';

describe('AmmBotService', () => {
  let service: AmmBotService;
  let riskConfigService: RiskConfigService;
  let strategyFactory: StrategyFactory;
  let dexFactory: DexFactory;
  let rebalancingService: RebalancingService;
  let dashboardService: DashboardService;

  beforeEach(async () => {
    const mockRiskConfigService = {
      getAllRiskProfiles: jest.fn(),
      validateRiskParameters: jest.fn(),
    };

    const mockStrategyFactory = {
      getAllStrategies: jest.fn(),
      getStrategy: jest.fn(),
    };

    const mockDexFactory = {
      getSupportedDexTypes: jest.fn(),
      compareDexes: jest.fn(),
    };

    const mockRebalancingService = {
      registerBot: jest.fn(),
      unregisterBot: jest.fn(),
      manualRebalance: jest.fn(),
      getRebalanceHistory: jest.fn(),
    };

    const mockDashboardService = {
      registerBot: jest.fn(),
      updateBot: jest.fn(),
      getBotDashboardData: jest.fn(),
      getDashboardData: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmmBotService,
        {
          provide: RiskConfigService,
          useValue: mockRiskConfigService,
        },
        {
          provide: StrategyFactory,
          useValue: mockStrategyFactory,
        },
        {
          provide: DexFactory,
          useValue: mockDexFactory,
        },
        {
          provide: RebalancingService,
          useValue: mockRebalancingService,
        },
        {
          provide: DashboardService,
          useValue: mockDashboardService,
        },
      ],
    }).compile();

    service = module.get<AmmBotService>(AmmBotService);
    riskConfigService = module.get<RiskConfigService>(RiskConfigService);
    strategyFactory = module.get<StrategyFactory>(StrategyFactory);
    dexFactory = module.get<DexFactory>(DexFactory);
    rebalancingService = module.get<RebalancingService>(RebalancingService);
    dashboardService = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createBot', () => {
    it('should create a new bot successfully', async () => {
      const createBotDto: CreateBotDto = {
        name: 'Test Bot',
        strategy: {
          type: StrategyType.CONSTANT_PRODUCT,
          name: 'Test Strategy',
          description: 'Test Description',
          riskParameters: {
            maxPositionSize: 100000,
            stopLossPercentage: 10,
            takeProfitPercentage: 20,
            priceRange: {
              lower: 0.9,
              upper: 1.1,
            },
            rebalanceTrigger: 15,
            maxSlippage: 1.0,
          },
          specificParams: {},
        },
        targetDexes: [DexType.UNISWAP_V3],
        initialCapital: 10000,
        autoStart: true,
      };

      const result = await service.createBot(createBotDto);

      expect(result).toBeDefined();
      expect(result.name).toBe(createBotDto.name);
      expect(result.status).toBe(BotStatus.STOPPED);
      expect(result.userId).toBe('default-user');
      expect(dashboardService.registerBot).toHaveBeenCalledWith(result);
    });

    it('should generate unique bot IDs', async () => {
      const createBotDto: CreateBotDto = {
        name: 'Test Bot',
        strategy: {
          type: StrategyType.CONSTANT_PRODUCT,
          name: 'Test Strategy',
          description: 'Test Description',
          riskParameters: {
            maxPositionSize: 100000,
            stopLossPercentage: 10,
            takeProfitPercentage: 20,
            priceRange: {
              lower: 0.9,
              upper: 1.1,
            },
            rebalanceTrigger: 15,
            maxSlippage: 1.0,
          },
          specificParams: {},
        },
        targetDexes: [DexType.UNISWAP_V3],
      };

      const bot1 = await service.createBot(createBotDto);
      const bot2 = await service.createBot(createBotDto);

      expect(bot1.id).not.toBe(bot2.id);
    });
  });

  describe('getBot', () => {
    it('should return a bot when it exists', async () => {
      const createBotDto: CreateBotDto = {
        name: 'Test Bot',
        strategy: {
          type: StrategyType.CONSTANT_PRODUCT,
          name: 'Test Strategy',
          description: 'Test Description',
          riskParameters: {
            maxPositionSize: 100000,
            stopLossPercentage: 10,
            takeProfitPercentage: 20,
            priceRange: {
              lower: 0.9,
              upper: 1.1,
            },
            rebalanceTrigger: 15,
            maxSlippage: 1.0,
          },
          specificParams: {},
        },
        targetDexes: [DexType.UNISWAP_V3],
      };

      const createdBot = await service.createBot(createBotDto);
      const retrievedBot = await service.getBot(createdBot.id);

      expect(retrievedBot).toBeDefined();
      expect(retrievedBot?.id).toBe(createdBot.id);
    });

    it('should return null when bot does not exist', async () => {
      const result = await service.getBot('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('startBot', () => {
    it('should start a stopped bot', async () => {
      const createBotDto: CreateBotDto = {
        name: 'Test Bot',
        strategy: {
          type: StrategyType.CONSTANT_PRODUCT,
          name: 'Test Strategy',
          description: 'Test Description',
          riskParameters: {
            maxPositionSize: 100000,
            stopLossPercentage: 10,
            takeProfitPercentage: 20,
            priceRange: {
              lower: 0.9,
              upper: 1.1,
            },
            rebalanceTrigger: 15,
            maxSlippage: 1.0,
          },
          specificParams: {},
        },
        targetDexes: [DexType.UNISWAP_V3],
      };

      const bot = await service.createBot(createBotDto);
      const startedBot = await service.startBot(bot.id);

      expect(startedBot).toBeDefined();
      expect(startedBot?.status).toBe(BotStatus.ACTIVE);
      expect(rebalancingService.registerBot).toHaveBeenCalledWith(bot.id);
    });

    it('should return null when trying to start non-existent bot', async () => {
      const result = await service.startBot('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('stopBot', () => {
    it('should stop an active bot', async () => {
      const createBotDto: CreateBotDto = {
        name: 'Test Bot',
        strategy: {
          type: StrategyType.CONSTANT_PRODUCT,
          name: 'Test Strategy',
          description: 'Test Description',
          riskParameters: {
            maxPositionSize: 100000,
            stopLossPercentage: 10,
            takeProfitPercentage: 20,
            priceRange: {
              lower: 0.9,
              upper: 1.1,
            },
            rebalanceTrigger: 15,
            maxSlippage: 1.0,
          },
          specificParams: {},
        },
        targetDexes: [DexType.UNISWAP_V3],
      };

      const bot = await service.createBot(createBotDto);
      await service.startBot(bot.id);
      const stoppedBot = await service.stopBot(bot.id);

      expect(stoppedBot).toBeDefined();
      expect(stoppedBot?.status).toBe(BotStatus.STOPPED);
      expect(rebalancingService.unregisterBot).toHaveBeenCalledWith(bot.id);
    });
  });

  describe('deleteBot', () => {
    it('should delete a bot successfully', async () => {
      const createBotDto: CreateBotDto = {
        name: 'Test Bot',
        strategy: {
          type: StrategyType.CONSTANT_PRODUCT,
          name: 'Test Strategy',
          description: 'Test Description',
          riskParameters: {
            maxPositionSize: 100000,
            stopLossPercentage: 10,
            takeProfitPercentage: 20,
            priceRange: {
              lower: 0.9,
              upper: 1.1,
            },
            rebalanceTrigger: 15,
            maxSlippage: 1.0,
          },
          specificParams: {},
        },
        targetDexes: [DexType.UNISWAP_V3],
      };

      const bot = await service.createBot(createBotDto);
      const deleteResult = await service.deleteBot(bot.id);
      const retrievedBot = await service.getBot(bot.id);

      expect(deleteResult).toBe(true);
      expect(retrievedBot).toBeNull();
    });

    it('should return false when trying to delete non-existent bot', async () => {
      const result = await service.deleteBot('non-existent-id');
      expect(result).toBe(false);
    });
  });
});
