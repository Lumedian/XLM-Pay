import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Decimal } from '@prisma/client/runtime/library';

interface StakingRequest {
  validatorAddress: string;
  chainId: string;
  stakedAmount: string;
}

interface SlashingRequest {
  validatorAddress: string;
  chainId: string;
  reason: string;
  slashPercentage: number; // e.g., 10.5 for 10.5%
}

/**
 * ValidatorService manages validator set with economic security through staking and slashing.
 *
 * Features:
 * - Validator registration with staking
 * - Slashing for misbehavior (double-signing, missed attestations, etc.)
 * - Validator set management
 * - Reward distribution
 */
@Injectable()
export class ValidatorService {
  private readonly logger = new Logger(ValidatorService.name);
  private readonly MIN_STAKE = '1000000000000000000'; // 1 token in wei

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Register a new validator with stake
   */
  async registerValidator(request: StakingRequest): Promise<any> {
    try {
      this.logger.log(`Registering validator ${request.validatorAddress} on ${request.chainId}`);

      // Validate inputs
      if (!this.isValidAddress(request.validatorAddress)) {
        throw new BadRequestException('Invalid validator address');
      }

      const stakedBigInt = BigInt(request.stakedAmount);
      const minStakeBigInt = BigInt(this.MIN_STAKE);

      if (stakedBigInt < minStakeBigInt) {
        throw new BadRequestException(
          `Minimum stake required: ${this.MIN_STAKE}`,
        );
      }

      // Check if validator already exists
      const existingValidator = await this.prisma.validator.findUnique({
        where: {
          chainId_validatorAddress: {
            chainId: request.chainId,
            validatorAddress: request.validatorAddress,
          },
        },
      });

      if (existingValidator && existingValidator.status !== 'EXITED') {
        throw new BadRequestException('Validator already registered on this chain');
      }

      // Create or update validator
      const validator = await this.prisma.validator.upsert({
        where: {
          chainId_validatorAddress: {
            chainId: request.chainId,
            validatorAddress: request.validatorAddress,
          },
        },
        create: {
          validatorAddress: request.validatorAddress,
          chainId: request.chainId,
          stakedAmount: new Decimal(request.stakedAmount),
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        update: {
          stakedAmount: new Decimal(request.stakedAmount),
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      this.logger.log(`Validator registered: ${validator.id}`);

      this.eventEmitter.emit('validator.registered', {
        validatorId: validator.id,
        validatorAddress: request.validatorAddress,
        chainId: request.chainId,
        stakedAmount: request.stakedAmount,
      });

      return {
        validatorId: validator.id,
        validatorAddress: validator.validatorAddress,
        chainId: validator.chainId,
        stakedAmount: validator.stakedAmount.toString(),
        status: validator.status,
        joinedAt: validator.joinedAt,
      };
    } catch (error) {
      this.logger.error(`Failed to register validator: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stake additional tokens to an existing validator
   */
  async addStake(request: StakingRequest): Promise<any> {
    try {
      const validator = await this.prisma.validator.findUnique({
        where: {
          chainId_validatorAddress: {
            chainId: request.chainId,
            validatorAddress: request.validatorAddress,
          },
        },
      });

      if (!validator) {
        throw new BadRequestException('Validator not found');
      }

      const additionalStake = new Decimal(request.stakedAmount);
      const newStake = validator.stakedAmount.plus(additionalStake);

      const updated = await this.prisma.validator.update({
        where: { id: validator.id },
        data: { stakedAmount: newStake },
      });

      this.eventEmitter.emit('validator.stake.added', {
        validatorId: validator.id,
        additionalStake: request.stakedAmount,
        totalStake: newStake.toString(),
      });

      return {
        validatorId: updated.id,
        totalStakedAmount: updated.stakedAmount.toString(),
      };
    } catch (error) {
      this.logger.error(`Failed to add stake: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initiate validator exit (unstaking begins after unbonding period)
   */
  async exitValidator(validatorAddress: string, chainId: string): Promise<any> {
    try {
      const validator = await this.prisma.validator.findUnique({
        where: {
          chainId_validatorAddress: {
            chainId,
            validatorAddress,
          },
        },
      });

      if (!validator) {
        throw new BadRequestException('Validator not found');
      }

      const updated = await this.prisma.validator.update({
        where: { id: validator.id },
        data: {
          status: 'EXITED',
          exitAmount: validator.stakedAmount,
          exitAt: new Date(),
        },
      });

      this.eventEmitter.emit('validator.exited', {
        validatorId: validator.id,
        exitAmount: validator.stakedAmount.toString(),
      });

      return {
        validatorId: updated.id,
        status: updated.status,
        exitAmount: updated.exitAmount?.toString(),
        exitAt: updated.exitAt,
      };
    } catch (error) {
      this.logger.error(`Failed to exit validator: ${error.message}`);
      throw error;
    }
  }

  /**
   * Slash a validator for misbehavior
   * Supports various slashing reasons:
   * - double_sign: Validator signed conflicting blocks
   * - missed_attestation: Validator failed to attest
   * - equivocation: Validator made conflicting claims
   */
  async slashValidator(request: SlashingRequest): Promise<any> {
    try {
      this.logger.warn(
        `Slashing validator ${request.validatorAddress} on ${request.chainId} for: ${request.reason}`,
      );

      const validator = await this.prisma.validator.findUnique({
        where: {
          chainId_validatorAddress: {
            chainId: request.chainId,
            validatorAddress: request.validatorAddress,
          },
        },
      });

      if (!validator) {
        throw new BadRequestException('Validator not found');
      }

      // Calculate slash amount
      const slashAmount = validator.stakedAmount
        .times(new Decimal(request.slashPercentage))
        .dividedBy(100);

      const newStake = validator.stakedAmount.minus(slashAmount);

      // Determine new status
      const newStatus = newStake.lte(0) ? 'SLASHED' : 'ACTIVE';

      // Create slashing event
      const slashingEvent = await this.prisma.slashingEvent.create({
        data: {
          validatorId: validator.id,
          slashAmount,
          reason: request.reason,
          slashPercentage: new Decimal(request.slashPercentage),
          isExecuted: true,
          executedAt: new Date(),
        },
      });

      // Update validator
      const updated = await this.prisma.validator.update({
        where: { id: validator.id },
        data: {
          stakedAmount: newStake.gte(0) ? newStake : new Decimal(0),
          totalSlashed: validator.totalSlashed.plus(slashAmount),
          status: newStatus,
        },
      });

      this.eventEmitter.emit('validator.slashed', {
        validatorId: validator.id,
        slashAmount: slashAmount.toString(),
        slashPercentage: request.slashPercentage,
        reason: request.reason,
        newStatus,
      });

      return {
        slashingEventId: slashingEvent.id,
        validatorId: validator.id,
        slashAmount: slashAmount.toString(),
        slashPercentage: request.slashPercentage,
        reason: request.reason,
        remainingStake: updated.stakedAmount.toString(),
        status: updated.status,
      };
    } catch (error) {
      this.logger.error(`Failed to slash validator: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get validator set for a chain
   */
  async getValidatorSet(chainId: string): Promise<any> {
    try {
      const validators = await this.prisma.validator.findMany({
        where: {
          chainId,
          status: 'ACTIVE',
        },
        include: {
          slashings: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      const totalStake = validators.reduce(
        (sum, v) => sum.plus(v.stakedAmount),
        new Decimal(0),
      );

      return {
        chainId,
        validatorCount: validators.length,
        totalStake: totalStake.toString(),
        validators: validators.map((v) => ({
          id: v.id,
          address: v.validatorAddress,
          stakedAmount: v.stakedAmount.toString(),
          totalSlashed: v.totalSlashed.toString(),
          status: v.status,
          joinedAt: v.joinedAt,
          stakingPercentage: totalStake.gt(0)
            ? v.stakedAmount.dividedBy(totalStake).times(100).toFixed(2)
            : '0',
          recentSlashings: v.slashings.map((s) => ({
            amount: s.slashAmount.toString(),
            reason: s.reason,
            timestamp: s.createdAt,
          })),
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to get validator set: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get validator details
   */
  async getValidator(validatorAddress: string, chainId: string): Promise<any> {
    const validator = await this.prisma.validator.findUnique({
      where: {
        chainId_validatorAddress: {
          chainId,
          validatorAddress,
        },
      },
      include: {
        slashings: true,
      },
    });

    if (!validator) {
      throw new BadRequestException('Validator not found');
    }

    return {
      id: validator.id,
      address: validator.validatorAddress,
      chainId: validator.chainId,
      stakedAmount: validator.stakedAmount.toString(),
      totalSlashed: validator.totalSlashed.toString(),
      status: validator.status,
      joinedAt: validator.joinedAt,
      exitAt: validator.exitAt,
      slashingHistory: validator.slashings.map((s) => ({
        amount: s.slashAmount.toString(),
        percentage: s.slashPercentage.toString(),
        reason: s.reason,
        timestamp: s.createdAt,
      })),
    };
  }

  /**
   * Initialize validator set for a chain (called during light client setup)
   */
  async initializeValidatorSet(chainId: string): Promise<void> {
    try {
      this.logger.log(`Initializing validator set for chain ${chainId}`);

      // In a real system, this would:
      // 1. Fetch the current validator set from the chain
      // 2. Store them in the database
      // 3. Set up slashing conditions and economic security parameters

      // For now, we just log the initialization
      this.logger.log(`Validator set initialized for ${chainId}`);
    } catch (error) {
      this.logger.error(`Failed to initialize validator set: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify validator is in good standing (not slashed, sufficient stake)
   */
  async isValidatorInGoodStanding(validatorAddress: string, chainId: string): Promise<boolean> {
    const validator = await this.prisma.validator.findUnique({
      where: {
        chainId_validatorAddress: {
          chainId,
          validatorAddress,
        },
      },
    });

    if (!validator or validator.status !== 'ACTIVE') {
      return false;
    }

    const minStakeBigInt = BigInt(this.MIN_STAKE);
    const validatorStakeBigInt = BigInt(validator.stakedAmount.toString());

    return validatorStakeBigInt >= minStakeBigInt;
  }

  /**
   * Check if address is valid (supports both EVM and other formats)
   */
  private isValidAddress(address: string): boolean {
    // Check for EVM address (0x + 40 hex chars)
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return true;
    }

    // Check for Stellar address (G + 55 base32 chars)
    if (/^G[A-Z2-7]{55}$/.test(address)) {
      return true;
    }

    // Check for Solana address (base58, 44 chars)
    if (/^[1-9A-HJ-NP-Z]{44}$/.test(address)) {
      return true;
    }

    // Check for Cosmos address (cosmos1 + bech32)
    if (/^cosmos1[a-z0-9]{39}$/.test(address)) {
      return true;
    }

    return false;
  }
}
