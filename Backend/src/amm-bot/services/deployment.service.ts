import { Injectable, Logger } from '@nestjs/common';
import { AmmBot, StrategyConfig, DexType, BotStatus, LiquidityPosition } from '../interfaces/amm-bot.interface';
import { StrategyFactory } from '../strategies/strategy.factory';
import { DexFactory } from '../integrations/dex.factory';
import { RiskConfigService } from '../config/risk-config.service';
import { RebalancingService } from './rebalancing.service';

export interface DeploymentConfig {
  userId: string;
  strategy: StrategyConfig;
  targetDexes: DexType[];
  initialCapital: number;
  tokenPairs: Array<{
    token0: string;
    token1: string;
    allocation: number; // Percentage of capital
  }>;
  autoStart: boolean;
}

export interface DeploymentResult {
  success: boolean;
  botId?: string;
  positions?: LiquidityPosition[];
  transactions?: Array<{
    dex: DexType;
    hash: string;
    status: string;
  }>;
  error?: string;
  warnings?: string[];
  estimatedAPR?: number;
  deploymentTime?: number;
}

@Injectable()
export class DeploymentService {
  private readonly logger = new Logger(DeploymentService.name);

  constructor(
    private readonly strategyFactory: StrategyFactory,
    private readonly dexFactory: DexFactory,
    private readonly riskConfigService: RiskConfigService,
    private readonly rebalancingService: RebalancingService,
  ) {}

  async deployStrategy(config: DeploymentConfig): Promise<DeploymentResult> {
    const startTime = Date.now();
    this.logger.log(`Starting deployment for user ${config.userId}`);

    try {
      // Validate deployment configuration
      const validation = this.validateDeploymentConfig(config);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid configuration: ${validation.errors.join(', ')}`
        };
      }

      // Create bot instance
      const bot = await this.createBotInstance(config);
      
      // Deploy across all target DEXes
      const deploymentResults = await this.deployAcrossDexes(bot, config);
      
      // Calculate performance metrics
      const estimatedAPR = this.calculateEstimatedAPR(bot, config);
      
      // Register bot for rebalancing if auto-start is enabled
      if (config.autoStart) {
        this.rebalancingService.registerBot(bot);
        bot.status = BotStatus.ACTIVE;
      } else {
        bot.status = BotStatus.PAUSED;
      }

      const deploymentTime = Date.now() - startTime;

      this.logger.log(`Successfully deployed bot ${bot.id} in ${deploymentTime}ms`);

      return {
        success: true,
        botId: bot.id,
        positions: bot.positions,
        transactions: deploymentResults,
        warnings: validation.warnings,
        estimatedAPR,
        deploymentTime
      };

    } catch (error) {
      this.logger.error(`Deployment failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown deployment error'
      };
    }
  }

  private validateDeploymentConfig(config: DeploymentConfig): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate user ID
    if (!config.userId) {
      errors.push('User ID is required');
    }

    // Validate strategy
    if (!config.strategy) {
      errors.push('Strategy configuration is required');
    } else {
      const riskValidation = this.riskConfigService.validateRiskParameters(
        config.strategy.riskParameters
      );
      if (!riskValidation.isValid) {
        errors.push(...riskValidation.errors.map(err => `Risk parameter: ${err}`));
      }
    }

    // Validate target DEXes
    if (!config.targetDexes || config.targetDexes.length === 0) {
      errors.push('At least one target DEX is required');
    }

    // Validate initial capital
    if (config.initialCapital <= 0) {
      errors.push('Initial capital must be greater than 0');
    }

    // Validate token pairs
    if (!config.tokenPairs || config.tokenPairs.length === 0) {
      errors.push('At least one token pair is required');
    } else {
      const totalAllocation = config.tokenPairs.reduce((sum, pair) => sum + pair.allocation, 0);
      if (Math.abs(totalAllocation - 100) > 0.1) {
        errors.push('Token pair allocations must sum to 100%');
      }

      config.tokenPairs.forEach(pair => {
        if (pair.allocation <= 0 || pair.allocation > 100) {
          errors.push(`Invalid allocation for pair ${pair.token0}/${pair.token1}: ${pair.allocation}%`);
        }
      });
    }

    // Add warnings for high-risk configurations
    if (config.strategy?.riskParameters.maxPositionSize > 500000) {
      warnings.push('Large position size detected - consider starting with smaller amounts');
    }

    if (config.targetDexes.length > 2) {
      warnings.push('Deploying to multiple DEXes increases complexity and monitoring requirements');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async createBotInstance(config: DeploymentConfig): Promise<AmmBot> {
    const botId = this.generateBotId();
    
    const bot: AmmBot = {
      id: botId,
      userId: config.userId,
      name: `${config.strategy.name} Bot - ${new Date().toISOString().split('T')[0]}`,
      strategy: config.strategy,
      positions: [],
      status: BotStatus.STOPPED,
      performance: {
        totalValueLocked: 0,
        feeRevenue: 0,
        impermanentLoss: 0,
        netProfit: 0,
        apr: 0,
        volume24h: 0,
        lastUpdateTime: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return bot;
  }

  private async deployAcrossDexes(
    bot: AmmBot,
    config: DeploymentConfig
  ): Promise<Array<{ dex: DexType; hash: string; status: string }>> {
    const transactions: Array<{ dex: DexType; hash: string; status: string }> = [];

    for (const dexType of config.targetDexes) {
      try {
        const dexIntegration = this.dexFactory.getIntegration(dexType);
        const strategy = this.strategyFactory.getStrategy(config.strategy.type);

        for (const tokenPair of config.tokenPairs) {
          const capitalForPair = (config.initialCapital * tokenPair.allocation) / 100;
          
          // Calculate optimal position using strategy
          const marketData = await this.getMarketData(tokenPair.token0, tokenPair.token1);
          const optimalPosition = await strategy.calculateOptimalPosition({
            token0: tokenPair.token0,
            token1: tokenPair.token1,
            totalAmount: capitalForPair,
            currentPrice: marketData.currentPrice,
            riskParameters: config.strategy.riskParameters,
            marketData
          });

          // Deploy liquidity position
          const result = await dexIntegration.addLiquidity({
            token0: tokenPair.token0,
            token1: tokenPair.token1,
            amount0: optimalPosition.amount0,
            amount1: optimalPosition.amount1,
            tickLower: optimalPosition.tickLower,
            tickUpper: optimalPosition.tickUpper,
            feeTier: config.strategy.specificParams.feeTier || 3000
          });

          if (result.status === 'SUCCESS') {
            const position: LiquidityPosition = {
              id: this.generatePositionId(),
              token0: tokenPair.token0,
              token1: tokenPair.token1,
              amount0: optimalPosition.amount0,
              amount1: optimalPosition.amount1,
              poolAddress: result.hash, // Using hash as placeholder for pool address
              dexType,
              tickLower: optimalPosition.tickLower,
              tickUpper: optimalPosition.tickUpper,
              feeTier: config.strategy.specificParams.feeTier || 3000
            };

            bot.positions.push(position);
            bot.performance.totalValueLocked += capitalForPair;

            transactions.push({
              dex: dexType,
              hash: result.hash,
              status: result.status
            });
          } else {
            throw new Error(`Failed to deploy on ${dexType}: ${result.error}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to deploy on ${dexType}:`, error);
        throw error;
      }
    }

    return transactions;
  }

  private async getMarketData(token0: string, token1: string) {
    const bestDex = await this.dexFactory.getBestDexForPair(token0, token1);
    const dexIntegration = this.dexFactory.getIntegration(bestDex.dex);
    
    const currentPrice = await dexIntegration.getCurrentPrice(token0, token1);
    const poolData = await dexIntegration.getPoolData(token0, token1);

    return {
      token0,
      token1,
      currentPrice,
      price24hChange: (Math.random() - 0.5) * 0.1, // Simulated
      volume24h: poolData.volume24h,
      liquidity: poolData.liquidity,
      timestamp: new Date()
    };
  }

  private calculateEstimatedAPR(bot: AmmBot, config: DeploymentConfig): number {
    // Simple APR calculation based on strategy and market conditions
    const strategy = this.strategyFactory.getStrategy(config.strategy.type);
    
    // Base APR calculation (would be more sophisticated in real implementation)
    let totalAPR = 0;
    let totalWeight = 0;

    config.tokenPairs.forEach(pair => {
      const weight = pair.allocation / 100;
      // Simulated APR based on strategy type
      let strategyAPR = 0;
      
      switch (config.strategy.type) {
        case 'CONSTANT_PRODUCT':
          strategyAPR = 0.05; // 5% base
          break;
        case 'CONCENTRATED_LIQUIDITY':
          strategyAPR = 0.12; // 12% base
          break;
        case 'DYNAMIC_FEES':
          strategyAPR = 0.08; // 8% base
          break;
      }

      // Adjust for risk parameters
      const riskMultiplier = 1 + (config.strategy.riskParameters.maxPositionSize / 1000000) * 0.5;
      
      totalAPR += strategyAPR * weight * riskMultiplier;
      totalWeight += weight;
    });

    return totalWeight > 0 ? (totalAPR / totalWeight) * 100 : 0;
  }

  async quickDeploy(
    userId: string,
    strategyType: string,
    riskProfile: string,
    initialCapital: number,
    tokenPair: { token0: string; token1: string }
  ): Promise<DeploymentResult> {
    // Get recommended risk profile
    const profile = this.riskConfigService.getRiskProfile(riskProfile);
    if (!profile) {
      return {
        success: false,
        error: `Risk profile '${riskProfile}' not found`
      };
    }

    // Create strategy configuration
    const strategyConfig: StrategyConfig = {
      type: strategyType as any,
      name: `${strategyType} Quick Deploy`,
      description: `Quick deployment using ${riskProfile} risk profile`,
      riskParameters: profile.parameters,
      specificParams: {}
    };

    // Determine best DEX for the pair
    const bestDex = await this.dexFactory.getBestDexForPair(tokenPair.token0, tokenPair.token1);

    const deploymentConfig: DeploymentConfig = {
      userId,
      strategy: strategyConfig,
      targetDexes: [bestDex.dex],
      initialCapital,
      tokenPairs: [{
        token0: tokenPair.token0,
        token1: tokenPair.token1,
        allocation: 100
      }],
      autoStart: true
    };

    return this.deployStrategy(deploymentConfig);
  }

  async stopBot(botId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Unregister from rebalancing
      this.rebalancingService.unregisterBot(botId);
      
      // In a real implementation, this would also:
      // - Remove all liquidity positions
      // - Collect any remaining fees
      // - Update bot status in database
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private generateBotId(): string {
    return 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  private generatePositionId(): string {
    return 'pos_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async getDeploymentTemplates(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    strategyType: string;
    riskProfile: string;
    recommendedCapital: { min: number; max: number };
    expectedAPR: { min: number; max: number };
    complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  }>> {
    return [
      {
        id: 'conservative_cp',
        name: 'Conservative Constant Product',
        description: 'Low-risk strategy using 50/50 liquidity distribution across full price range',
        strategyType: 'CONSTANT_PRODUCT',
        riskProfile: 'CONSERVATIVE',
        recommendedCapital: { min: 1000, max: 50000 },
        expectedAPR: { min: 3, max: 8 },
        complexity: 'LOW'
      },
      {
        id: 'moderate_cl',
        name: 'Moderate Concentrated Liquidity',
        description: 'Balanced strategy with concentrated liquidity around current price',
        strategyType: 'CONCENTRATED_LIQUIDITY',
        riskProfile: 'MODERATE',
        recommendedCapital: { min: 5000, max: 100000 },
        expectedAPR: { min: 8, max: 20 },
        complexity: 'MEDIUM'
      },
      {
        id: 'aggressive_df',
        name: 'Aggressive Dynamic Fees',
        description: 'High-risk strategy with dynamic fee adjustment based on volatility',
        strategyType: 'DYNAMIC_FEES',
        riskProfile: 'AGGRESSIVE',
        recommendedCapital: { min: 10000, max: 500000 },
        expectedAPR: { min: 15, max: 35 },
        complexity: 'HIGH'
      }
    ];
  }
}
