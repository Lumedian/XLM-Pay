import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskParameter, RiskType, RiskStatus } from '../entities/risk-parameter.entity';
import { BotStrategy } from '../entities/bot-strategy.entity';
import { CreateRiskParameterDto } from '../dto/create-risk-parameter.dto';
import { UpdateRiskParameterDto } from '../dto/update-risk-parameter.dto';

@Injectable()
export class RiskManagementService {
  private readonly logger = new Logger(RiskManagementService.name);

  constructor(
    @InjectRepository(RiskParameter)
    private riskParameterRepository: Repository<RiskParameter>,
    @InjectRepository(BotStrategy)
    private strategyRepository: Repository<BotStrategy>,
  ) {}

  async createRiskParameter(
    userId: string,
    strategyId: string,
    createRiskDto: CreateRiskParameterDto,
  ): Promise<RiskParameter> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId, userId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    // Check if risk parameter already exists for this strategy and type
    const existingRisk = await this.riskParameterRepository.findOne({
      where: { strategyId, riskType: createRiskDto.riskType },
    });

    if (existingRisk) {
      throw new BadRequestException(
        `Risk parameter of type ${createRiskDto.riskType} already exists for this strategy`,
      );
    }

    const riskParameter = this.riskParameterRepository.create({
      strategyId,
      ...createRiskDto,
      status: RiskStatus.ACTIVE,
    });

    const savedRisk = await this.riskParameterRepository.save(riskParameter);
    this.logger.log(`Created risk parameter: ${savedRisk.id} for strategy: ${strategyId}`);
    return savedRisk;
  }

  async updateRiskParameter(
    userId: string,
    riskId: string,
    updateRiskDto: UpdateRiskParameterDto,
  ): Promise<RiskParameter> {
    const riskParameter = await this.getRiskParameterWithStrategy(riskId, userId);

    Object.assign(riskParameter, updateRiskDto);
    riskParameter.updatedAt = new Date();

    const updatedRisk = await this.riskParameterRepository.save(riskParameter);
    this.logger.log(`Updated risk parameter: ${riskId}`);
    return updatedRisk;
  }

  async getRiskParameters(userId: string, strategyId: string): Promise<RiskParameter[]> {
    const strategy = await this.strategyRepository.findOne({
      where: { id: strategyId, userId },
    });

    if (!strategy) {
      throw new NotFoundException(`Strategy ${strategyId} not found`);
    }

    return await this.riskParameterRepository.find({
      where: { strategyId },
      order: { createdAt: 'ASC' },
    });
  }

  async deleteRiskParameter(userId: string, riskId: string): Promise<void> {
    const riskParameter = await this.getRiskParameterWithStrategy(riskId, userId);

    if (riskParameter.status === RiskStatus.TRIGGERED) {
      throw new BadRequestException('Cannot delete a triggered risk parameter');
    }

    await this.riskParameterRepository.delete({ id: riskId });
    this.logger.log(`Deleted risk parameter: ${riskId}`);
  }

  async checkRiskLimits(strategyId: string): Promise<{
    triggered: RiskParameter[];
    warnings: RiskParameter[];
  }> {
    const riskParameters = await this.riskParameterRepository.find({
      where: { strategyId, status: RiskStatus.ACTIVE },
    });

    const triggered: RiskParameter[] = [];
    const warnings: RiskParameter[] = [];

    for (const riskParam of riskParameters) {
      const result = await this.evaluateRiskParameter(riskParam);
      
      if (result.triggered) {
        triggered.push(riskParam);
        await this.triggerRiskParameter(riskParam, result.currentValue);
      } else if (result.warning) {
        warnings.push(riskParam);
      }
    }

    return { triggered, warnings };
  }

  async resetRiskParameter(userId: string, riskId: string): Promise<RiskParameter> {
    const riskParameter = await this.getRiskParameterWithStrategy(riskId, userId);

    riskParameter.status = RiskStatus.ACTIVE;
    riskParameter.currentValue = null;
    riskParameter.triggerValue = null;
    riskParameter.lastTriggeredAt = null;
    riskParameter.updatedAt = new Date();

    const resetRisk = await this.riskParameterRepository.save(riskParameter);
    this.logger.log(`Reset risk parameter: ${riskId}`);
    return resetRisk;
  }

  async getRiskHistory(userId: string, strategyId: string): Promise<{
    triggeredEvents: Array<{
      riskId: string;
      riskType: RiskType;
      triggeredAt: Date;
      triggerValue: string;
      currentValue: string;
    }>;
  }> {
    const riskParameters = await this.riskParameterRepository.find({
      where: { 
        strategyId, 
        status: RiskStatus.TRIGGERED,
        lastTriggeredAt: null,
      },
    });

    const triggeredEvents = riskParameters
      .filter(risk => risk.lastTriggeredAt)
      .map(risk => ({
        riskId: risk.id,
        riskType: risk.riskType,
        triggeredAt: risk.lastTriggeredAt!,
        triggerValue: risk.triggerValue!,
        currentValue: risk.currentValue!,
      }));

    return { triggeredEvents };
  }

  private async getRiskParameterWithStrategy(riskId: string, userId: string): Promise<RiskParameter> {
    const riskParameter = await this.riskParameterRepository.findOne({
      where: { id: riskId },
      relations: ['strategy'],
    });

    if (!riskParameter) {
      throw new NotFoundException(`Risk parameter ${riskId} not found`);
    }

    if (riskParameter.strategy.userId !== userId) {
      throw new NotFoundException(`Risk parameter ${riskId} not found`);
    }

    return riskParameter;
  }

  private async evaluateRiskParameter(riskParam: RiskParameter): Promise<{
    triggered: boolean;
    warning: boolean;
    currentValue?: string;
  }> {
    switch (riskParam.riskType) {
      case RiskType.MAX_POSITION_SIZE:
        return await this.evaluateMaxPositionSize(riskParam);
      case RiskType.MAX_DRAWDOWN:
        return await this.evaluateMaxDrawdown(riskParam);
      case RiskType.IMPERMANENT_LOSS_LIMIT:
        return await this.evaluateImpermanentLossLimit(riskParam);
      case RiskType.PRICE_DEVIATION_LIMIT:
        return await this.evaluatePriceDeviationLimit(riskParam);
      default:
        return { triggered: false, warning: false };
    }
  }

  private async evaluateMaxPositionSize(riskParam: RiskParameter): Promise<{
    triggered: boolean;
    warning: boolean;
    currentValue?: string;
  }> {
    // This would integrate with position tracking service
    // For now, return mock evaluation
    const currentValue = '1000'; // Mock current position size
    const threshold = parseFloat(riskParam.threshold);
    const current = parseFloat(currentValue);
    
    return {
      triggered: current > threshold,
      warning: current > threshold * 0.9,
      currentValue,
    };
  }

  private async evaluateMaxDrawdown(riskParam: RiskParameter): Promise<{
    triggered: boolean;
    warning: boolean;
    currentValue?: string;
  }> {
    // This would integrate with performance tracking service
    const currentValue = '0.15'; // Mock 15% drawdown
    const threshold = parseFloat(riskParam.threshold);
    const current = parseFloat(currentValue);
    
    return {
      triggered: current > threshold,
      warning: current > threshold * 0.9,
      currentValue,
    };
  }

  private async evaluateImpermanentLossLimit(riskParam: RiskParameter): Promise<{
    triggered: boolean;
    warning: boolean;
    currentValue?: string;
  }> {
    // This would integrate with impermanent loss service
    const currentValue = '0.08'; // Mock 8% IL
    const threshold = parseFloat(riskParam.threshold);
    const current = parseFloat(currentValue);
    
    return {
      triggered: current > threshold,
      warning: current > threshold * 0.9,
      currentValue,
    };
  }

  private async evaluatePriceDeviationLimit(riskParam: RiskParameter): Promise<{
    triggered: boolean;
    warning: boolean;
    currentValue?: string;
  }> {
    // This would integrate with price oracle service
    const currentValue = '0.05'; // Mock 5% price deviation
    const threshold = parseFloat(riskParam.threshold);
    const current = parseFloat(currentValue);
    
    return {
      triggered: current > threshold,
      warning: current > threshold * 0.9,
      currentValue,
    };
  }

  private async triggerRiskParameter(riskParam: RiskParameter, currentValue: string): Promise<void> {
    riskParam.status = RiskStatus.TRIGGERED;
    riskParam.currentValue = currentValue;
    riskParam.triggerValue = currentValue;
    riskParam.lastTriggeredAt = new Date();
    riskParam.triggerCount += 1;
    riskParam.updatedAt = new Date();

    await this.riskParameterRepository.save(riskParam);

    // Execute risk mitigation action
    await this.executeRiskMitigation(riskParam);

    this.logger.warn(`Risk parameter triggered: ${riskParam.id} - ${riskParam.riskType}`);
  }

  private async executeRiskMitigation(riskParam: RiskParameter): Promise<void> {
    const action = riskParam.parameters?.rebalanceAction || 'reduce_position';
    
    switch (action) {
      case 'reduce_position':
        // Integrate with rebalance service to reduce position
        this.logger.log(`Executing risk mitigation: reduce_position for risk: ${riskParam.id}`);
        break;
      case 'close_position':
        // Integrate with rebalance service to close position
        this.logger.log(`Executing risk mitigation: close_position for risk: ${riskParam.id}`);
        break;
      case 'pause_strategy':
        // Integrate with strategy service to pause strategy
        this.logger.log(`Executing risk mitigation: pause_strategy for risk: ${riskParam.id}`);
        break;
    }
  }
}
