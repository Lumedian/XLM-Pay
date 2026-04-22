import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BotStrategy, StrategyType, StrategyStatus } from '../entities/bot-strategy.entity';
import { BotPosition, PositionStatus, PositionType } from '../entities/bot-position.entity';
import { CreateStrategyDto } from '../dto/create-strategy.dto';
import { UpdateStrategyDto } from '../dto/update-strategy.dto';

@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);

  constructor(
    @InjectRepository(BotStrategy)
    private strategyRepository: Repository<BotStrategy>,
    @InjectRepository(BotPosition)
    private positionRepository: Repository<BotPosition>,
    private dataSource: DataSource,
  ) {}

  async createStrategy(userId: string, createStrategyDto: CreateStrategyDto): Promise<BotStrategy> {
    const { name, strategyType, configuration, dexConfigurations } = createStrategyDto;

    // Validate strategy configuration
    this.validateStrategyConfiguration(strategyType, configuration);

    // Check if strategy name already exists for user
    const existingStrategy = await this.strategyRepository.findOne({
      where: { userId, name },
    });

    if (existingStrategy) {
      throw new BadRequestException(`Strategy with name '${name}' already exists`);
    }

    const strategy = this.strategyRepository.create({
      name,
      userId,
      strategyType,
      configuration,
      dexConfigurations,
      status: StrategyStatus.ACTIVE,
    });

    const savedStrategy = await this.strategyRepository.save(strategy);

    // Initialize positions for each DEX configuration
    await this.initializePositions(savedStrategy);

    this.logger.log(`Created new strategy: ${savedStrategy.id} for user: ${userId}`);
    return savedStrategy;
  }

  async updateStrategy(userId: string, strategyId: string, updateStrategyDto: UpdateStrategyDto): Promise<BotStrategy> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId, userId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    // Validate updated configuration
    if (updateStrategyDto.configuration) {
      this.validateStrategyConfiguration(strategy.strategyType, updateStrategyDto.configuration);
    }

    Object.assign(strategy, updateStrategyDto);
    strategy.updatedAt = new Date();

    const updatedStrategy = await this.strategyRepository.save(strategy);

    // If DEX configurations changed, update positions
    if (updateStrategyDto.dexConfigurations) {
      await this.updatePositionsForStrategy(updatedStrategy);
    }

    this.logger.log(`Updated strategy: ${strategyId} for user: ${userId}`);
    return updatedStrategy;
  }

  async getStrategy(userId: string, strategyId: string): Promise<BotStrategy> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId, userId },
      relations: ['positions', 'riskParameters'],
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    return strategy;
  }

  async getUserStrategies(userId: string, page = 1, limit = 20): Promise<{ strategies: BotStrategy[]; total: number }> {
    const [strategies, total] = await this.strategyRepository.findAndCount({
      where: { userId },
      relations: ['positions', 'riskParameters'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { strategies, total };
  }

  async pauseStrategy(userId: string, strategyId: string): Promise<BotStrategy> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId, userId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    strategy.status = StrategyStatus.PAUSED;
    strategy.updatedAt = new Date();

    // Pause all positions
    await this.positionRepository.update(
      { strategyId },
      { status: PositionStatus.INACTIVE }
    );

    const updatedStrategy = await this.strategyRepository.save(strategy);
    this.logger.log(`Paused strategy: ${strategyId} for user: ${userId}`);
    return updatedStrategy;
  }

  async resumeStrategy(userId: string, strategyId: string): Promise<BotStrategy> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId, userId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    strategy.status = StrategyStatus.ACTIVE;
    strategy.updatedAt = new Date();

    // Resume all positions
    await this.positionRepository.update(
      { strategyId },
      { status: PositionStatus.ACTIVE }
    );

    const updatedStrategy = await this.strategyRepository.save(strategy);
    this.logger.log(`Resumed strategy: ${strategyId} for user: ${userId}`);
    return updatedStrategy;
  }

  async stopStrategy(userId: string, strategyId: string): Promise<BotStrategy> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId, userId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    strategy.status = StrategyStatus.STOPPED;
    strategy.updatedAt = new Date();

    // Close all positions
    await this.positionRepository.update(
      { strategyId },
      { status: PositionStatus.CLOSED }
    );

    const updatedStrategy = await this.strategyRepository.save(strategy);
    this.logger.log(`Stopped strategy: ${strategyId} for user: ${userId}`);
    return updatedStrategy;
  }

  async deleteStrategy(userId: string, strategyId: string): Promise<void> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId, userId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    if (strategy.status === StrategyStatus.ACTIVE) {
      throw new BadRequestException('Cannot delete an active strategy. Please stop it first.');
    }

    await this.dataSource.transaction(async manager => {
      // Delete related positions
      await manager.delete(BotPosition, { strategyId });
      
      // Delete the strategy
      await manager.delete(BotStrategy, { id: strategyId });
    });

    this.logger.log(`Deleted strategy: ${strategyId} for user: ${userId}`);
  }

  private validateStrategyConfiguration(strategyType: StrategyType, configuration: any): void {
    switch (strategyType) {
      case StrategyType.CONSTANT_PRODUCT:
        this.validateConstantProductConfig(configuration);
        break;
      case StrategyType.CONCENTRATED_LIQUIDITY:
        this.validateConcentratedLiquidityConfig(configuration);
        break;
      case StrategyType.DYNAMIC_FEES:
        this.validateDynamicFeesConfig(configuration);
        break;
      default:
        throw new BadRequestException(`Unknown strategy type: ${strategyType}`);
    }
  }

  private validateConstantProductConfig(configuration: any): void {
    const { totalLiquidity, rebalanceThreshold, maxSlippage } = configuration;

    if (!totalLiquidity || parseFloat(totalLiquidity) <= 0) {
      throw new BadRequestException('Total liquidity must be greater than 0');
    }

    if (rebalanceThreshold && (rebalanceThreshold < 0 || rebalanceThreshold > 100)) {
      throw new BadRequestException('Rebalance threshold must be between 0 and 100');
    }

    if (maxSlippage && (maxSlippage < 0 || maxSlippage > 100)) {
      throw new BadRequestException('Max slippage must be between 0 and 100');
    }
  }

  private validateConcentratedLiquidityConfig(configuration: any): void {
    const { totalLiquidity, priceRange, rebalanceThreshold, maxSlippage } = configuration;

    this.validateConstantProductConfig(configuration);

    if (!priceRange) {
      throw new BadRequestException('Price range is required for concentrated liquidity strategy');
    }

    const { lowerBound, upperBound } = priceRange;
    if (!lowerBound || !upperBound || parseFloat(lowerBound) >= parseFloat(upperBound)) {
      throw new BadRequestException('Invalid price range: lower bound must be less than upper bound');
    }
  }

  private validateDynamicFeesConfig(configuration: any): void {
    const { totalLiquidity, feeTier, rebalanceThreshold, maxSlippage } = configuration;

    this.validateConstantProductConfig(configuration);

    if (feeTier && (feeTier < 0 || feeTier > 10000)) {
      throw new BadRequestException('Fee tier must be between 0 and 10000 basis points');
    }
  }

  private async initializePositions(strategy: BotStrategy): Promise<void> {
    const positions = strategy.dexConfigurations.map(dexConfig => 
      this.positionRepository.create({
        strategyId: strategy.id,
        dexName: dexConfig.dexName,
        poolAddress: dexConfig.poolAddress,
        tokenA: dexConfig.tokenPair.tokenA,
        tokenB: dexConfig.tokenPair.tokenB,
        positionType: PositionType.LIQUIDITY,
        status: PositionStatus.ACTIVE,
        amountA: '0',
        amountB: '0',
        priceRange: strategy.configuration.priceRange ? {
          ...strategy.configuration.priceRange,
          currentPrice: '0',
        } : null,
      })
    );

    await this.positionRepository.save(positions);
  }

  private async updatePositionsForStrategy(strategy: BotStrategy): Promise<void> {
    // Remove existing positions
    await this.positionRepository.delete({ strategyId: strategy.id });

    // Create new positions
    await this.initializePositions(strategy);
  }
}
