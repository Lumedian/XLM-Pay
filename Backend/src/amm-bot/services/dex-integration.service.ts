import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DexConfiguration, DexType, DexStatus } from '../entities/dex-configuration.entity';
import { BotPosition, PositionStatus } from '../entities/bot-position.entity';
import { BotStrategy } from '../entities/bot-strategy.entity';

@Injectable()
export class DexIntegrationService {
  private readonly logger = new Logger(DexIntegrationService.name);

  constructor(
    @InjectRepository(DexConfiguration)
    private dexConfigRepository: Repository<DexConfiguration>,
    @InjectRepository(BotPosition)
    private positionRepository: Repository<BotPosition>,
  ) {}

  async deployToMultipleDexes(
    strategy: BotStrategy,
    deploymentData: Array<{
      dexName: string;
      amountA: string;
      amountB: string;
    }>,
  ): Promise<BotPosition[]> {
    const deployedPositions: BotPosition[] = [];

    for (const dexConfig of strategy.dexConfigurations) {
      const deployment = deploymentData.find(d => d.dexName === dexConfig.dexName);
      if (!deployment) {
        this.logger.warn(`No deployment data found for DEX: ${dexConfig.dexName}`);
        continue;
      }

      try {
        const position = await this.deployToDex(
          strategy,
          dexConfig,
          deployment.amountA,
          deployment.amountB,
        );
        deployedPositions.push(position);
      } catch (error) {
        this.logger.error(`Failed to deploy to ${dexConfig.dexName}: ${error.message}`);
        // Continue with other DEXes even if one fails
      }
    }

    return deployedPositions;
  }

  async deployToDex(
    strategy: BotStrategy,
    dexConfig: any,
    amountA: string,
    amountB: string,
  ): Promise<BotPosition> {
    const dexConfiguration = await this.getDexConfiguration(dexConfig.dexName);
    
    // Create or update position
    let position = await this.positionRepository.findOne({
      where: {
        strategyId: strategy.id,
        dexName: dexConfig.dexName,
        poolAddress: dexConfig.poolAddress,
      },
    });

    if (position) {
      position.amountA = amountA;
      position.amountB = amountB;
      position.status = PositionStatus.ACTIVE;
      position.updatedAt = new Date();
    } else {
      position = this.positionRepository.create({
        strategyId: strategy.id,
        dexName: dexConfig.dexName,
        poolAddress: dexConfig.poolAddress,
        tokenA: dexConfig.tokenPair.tokenA,
        tokenB: dexConfig.tokenPair.tokenB,
        positionType: 'liquidity',
        status: PositionStatus.ACTIVE,
        amountA,
        amountB,
        priceRange: strategy.configuration.priceRange ? {
          ...strategy.configuration.priceRange,
          currentPrice: '0',
        } : null,
      });
    }

    // Execute DEX-specific deployment logic
    await this.executeDexDeployment(dexConfiguration, position, strategy);

    const savedPosition = await this.positionRepository.save(position);
    this.logger.log(`Deployed position to ${dexConfig.dexName}: ${savedPosition.id}`);
    
    return savedPosition;
  }

  async withdrawFromDex(
    userId: string,
    positionId: string,
    percentage: number = 100,
  ): Promise<BotPosition> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
      relations: ['strategy'],
    });

    if (!position) {
      throw new NotFoundException(`Position ${positionId} not found`);
    }

    if (position.strategy.userId !== userId) {
      throw new NotFoundException(`Position ${positionId} not found`);
    }

    const dexConfiguration = await this.getDexConfiguration(position.dexName);

    // Execute DEX-specific withdrawal
    await this.executeDexWithdrawal(dexConfiguration, position, percentage);

    // Update position
    if (percentage >= 100) {
      position.status = PositionStatus.CLOSED;
      position.amountA = '0';
      position.amountB = '0';
    } else {
      const withdrawAmountA = (parseFloat(position.amountA) * percentage / 100).toString();
      const withdrawAmountB = (parseFloat(position.amountB) * percentage / 100).toString();
      position.amountA = (parseFloat(position.amountA) - parseFloat(withdrawAmountA)).toString();
      position.amountB = (parseFloat(position.amountB) - parseFloat(withdrawAmountB)).toString();
    }

    position.updatedAt = new Date();
    const updatedPosition = await this.positionRepository.save(position);

    this.logger.log(`Withdrew ${percentage}% from position ${positionId}`);
    return updatedPosition;
  }

  async rebalancePosition(
    positionId: string,
    newAmountA: string,
    newAmountB: string,
  ): Promise<BotPosition> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
      relations: ['strategy'],
    });

    if (!position) {
      throw new NotFoundException(`Position ${positionId} not found`);
    }

    const dexConfiguration = await this.getDexConfiguration(position.dexName);

    // Execute DEX-specific rebalancing
    await this.executeDexRebalancing(dexConfiguration, position, newAmountA, newAmountB);

    // Update position
    position.amountA = newAmountA;
    position.amountB = newAmountB;
    position.lastRebalanceAt = new Date();
    position.updatedAt = new Date();

    const updatedPosition = await this.positionRepository.save(position);
    this.logger.log(`Rebalanced position ${positionId}`);

    return updatedPosition;
  }

  async getPosition(userId: string, positionId: string): Promise<BotPosition> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
      relations: ['strategy'],
    });

    if (!position) {
      throw new NotFoundException(`Position ${positionId} not found`);
    }

    if (position.strategy.userId !== userId) {
      throw new NotFoundException(`Position ${positionId} not found`);
    }

    return position;
  }

  async collectFees(positionId: string): Promise<{
    feesA: string;
    feesB: string;
    position: BotPosition;
  }> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId },
    });

    if (!position) {
      throw new NotFoundException(`Position ${positionId} not found`);
    }

    const dexConfiguration = await this.getDexConfiguration(position.dexName);

    // Execute DEX-specific fee collection
    const collectedFees = await this.executeDexFeeCollection(dexConfiguration, position);

    // Update position with collected fees
    position.feesEarnedA = (parseFloat(position.feesEarnedA) + parseFloat(collectedFees.feesA)).toString();
    position.feesEarnedB = (parseFloat(position.feesEarnedB) + parseFloat(collectedFees.feesB)).toString();
    position.lastFeeCollectionAt = new Date();
    position.updatedAt = new Date();

    const updatedPosition = await this.positionRepository.save(position);

    this.logger.log(`Collected fees from position ${positionId}: ${collectedFees.feesA} A, ${collectedFees.feesB} B`);

    return {
      feesA: collectedFees.feesA,
      feesB: collectedFees.feesB,
      position: updatedPosition,
    };
  }

  async getDexStatus(dexName: string): Promise<{
    status: DexStatus;
    healthMetrics: any;
    lastHealthCheck: Date;
  }> {
    const dexConfig = await this.getDexConfiguration(dexName);
    
    // Perform health check
    const healthMetrics = await this.performDexHealthCheck(dexConfig);
    
    // Update health metrics in database
    dexConfig.healthMetrics = healthMetrics;
    dexConfig.lastHealthCheck = new Date();
    dexConfig.status = healthMetrics.errorRate > 0.1 ? DexStatus.MAINTENANCE : DexStatus.ACTIVE;
    
    await this.dexConfigRepository.save(dexConfig);

    return {
      status: dexConfig.status,
      healthMetrics,
      lastHealthCheck: dexConfig.lastHealthCheck,
    };
  }

  async getSupportedDexes(): Promise<DexConfiguration[]> {
    return await this.dexConfigRepository.find({
      where: { status: DexStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  private async getDexConfiguration(dexName: string): Promise<DexConfiguration> {
    const dexConfig = await this.dexConfigRepository.findOne({
      where: { name: dexName },
    });

    if (!dexConfig) {
      throw new NotFoundException(`DEX configuration for ${dexName} not found`);
    }

    if (dexConfig.status !== DexStatus.ACTIVE) {
      throw new BadRequestException(`DEX ${dexName} is not currently active`);
    }

    return dexConfig;
  }

  private async executeDexDeployment(
    dexConfig: DexConfiguration,
    position: BotPosition,
    strategy: BotStrategy,
  ): Promise<void> {
    switch (dexConfig.dexType) {
      case DexType.UNISWAP_V3:
        await this.deployToUniswapV3(dexConfig, position, strategy);
        break;
      case DexType.CURVE:
        await this.deployToCurve(dexConfig, position, strategy);
        break;
      case DexType.BALANCER:
        await this.deployToBalancer(dexConfig, position, strategy);
        break;
      case DexType.STELLAR_DEX:
        await this.deployToStellarDex(dexConfig, position, strategy);
        break;
      default:
        throw new BadRequestException(`Unsupported DEX type: ${dexConfig.dexType}`);
    }
  }

  private async executeDexWithdrawal(
    dexConfig: DexConfiguration,
    position: BotPosition,
    percentage: number,
  ): Promise<void> {
    // DEX-specific withdrawal logic
    this.logger.log(`Executing withdrawal on ${dexConfig.dexType}: ${percentage}%`);
  }

  private async executeDexRebalancing(
    dexConfig: DexConfiguration,
    position: BotPosition,
    newAmountA: string,
    newAmountB: string,
  ): Promise<void> {
    // DEX-specific rebalancing logic
    this.logger.log(`Executing rebalancing on ${dexConfig.dexType}`);
  }

  private async executeDexFeeCollection(
    dexConfig: DexConfiguration,
    position: BotPosition,
  ): Promise<{ feesA: string; feesB: string }> {
    // DEX-specific fee collection logic
    // Mock implementation
    return {
      feesA: '0.001',
      feesB: '0.002',
    };
  }

  private async performDexHealthCheck(dexConfig: DexConfiguration): Promise<any> {
    // Mock health check implementation
    return {
      latency: Math.random() * 1000,
      errorRate: Math.random() * 0.1,
      uptime: 99.9,
      lastBlockNumber: 12345678,
    };
  }

  private async deployToUniswapV3(
    dexConfig: DexConfiguration,
    position: BotPosition,
    strategy: BotStrategy,
  ): Promise<void> {
    // Uniswap V3 specific deployment logic
    this.logger.log(`Deploying to Uniswap V3 pool: ${position.poolAddress}`);
  }

  private async deployToCurve(
    dexConfig: DexConfiguration,
    position: BotPosition,
    strategy: BotStrategy,
  ): Promise<void> {
    // Curve specific deployment logic
    this.logger.log(`Deploying to Curve pool: ${position.poolAddress}`);
  }

  private async deployToBalancer(
    dexConfig: DexConfiguration,
    position: BotPosition,
    strategy: BotStrategy,
  ): Promise<void> {
    // Balancer specific deployment logic
    this.logger.log(`Deploying to Balancer pool: ${position.poolAddress}`);
  }

  private async deployToStellarDex(
    dexConfig: DexConfiguration,
    position: BotPosition,
    strategy: BotStrategy,
  ): Promise<void> {
    // Stellar DEX specific deployment logic
    this.logger.log(`Deploying to Stellar DEX pool: ${position.poolAddress}`);
  }
}
