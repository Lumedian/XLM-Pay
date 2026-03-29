import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChainAdapterService } from './chain-adapter.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface HeaderProofData {
  blockNumber: bigint;
  blockHash: string;
  proof: string;
  signerBitmap: string;
  threshold: number;
}

/**
 * LightClientService handles multi-chain light client verification.
 *
 * Supports verification of:
 * - EVM chains (Ethereum, Avalanche, Polygon, Arbitrum, Optimism, Base)
 * - Solana
 * - Cosmos
 * - Polkadot
 * - Stellar
 */
@Injectable()
export class LightClientService {
  private readonly logger = new Logger(LightClientService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainAdapter: ChainAdapterService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Update light client for a specific chain with latest headers
   */
  async updateLightClient(chainId: string): Promise<any> {
    try {
      this.logger.log(`Updating light client for chain ${chainId}`);

      // Get or create light client
      let lightClient = await this.prisma.lightClient.findUnique({
        where: { chainId },
      });

      if (!lightClient) {
        // Create new light client
        const adapter = await this.prisma.chainAdapter.findUnique({
          where: { chainId },
        });

        if (!adapter) {
          throw new Error(`Chain adapter not found for ${chainId}`);
        }

        // Fetch latest block from RPC
        const latestBlock = await this.chainAdapter.getLatestBlock(adapter.rpcEndpoint);

        lightClient = await this.prisma.lightClient.create({
          data: {
            chainId,
            latestBlockNumber: latestBlock.number,
            latestBlockHash: latestBlock.hash,
            latestBlockTime: new Date(latestBlock.timestamp * 1000),
            commitmentRoot: latestBlock.stateRoot || latestBlock.blockHash,
            validatorSetRoot: await this.getValidatorSetRoot(chainId),
            trustedBlockNumber: latestBlock.number,
          },
        });
      } else {
        // Update existing light client
        const adapter = await this.prisma.chainAdapter.findUnique({
          where: { chainId },
        });

        const latestBlock = await this.chainAdapter.getLatestBlock(adapter.rpcEndpoint);

        // Verify new headers through validator signatures
        const headerProof = await this.verifyHeaderProof(
          chainId,
          latestBlock.number,
          latestBlock.hash,
        );

        if (headerProof.isVerified) {
          lightClient = await this.prisma.lightClient.update({
            where: { chainId },
            data: {
              latestBlockNumber: latestBlock.number,
              latestBlockHash: latestBlock.hash,
              latestBlockTime: new Date(latestBlock.timestamp * 1000),
              commitmentRoot: latestBlock.stateRoot || latestBlock.blockHash,
              verificationCount: { increment: 1 },
              lastUpdateTime: new Date(),
            },
          });

          this.eventEmitter.emit('light-client.updated', {
            chainId,
            blockNumber: latestBlock.number,
          });
        } else {
          await this.prisma.lightClient.update({
            where: { chainId },
            data: {
              failureCount: { increment: 1 },
            },
          });

          this.logger.warn(`Light client verification failed for chain ${chainId}`);
        }
      }

      return {
        chainId,
        blockNumber: lightClient.latestBlockNumber,
        blockHash: lightClient.latestBlockHash,
        verificationCount: lightClient.verificationCount,
        lastUpdate: lightClient.lastUpdateTime,
      };
    } catch (error) {
      this.logger.error(`Failed to update light client for ${chainId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify a header proof using validator signatures
   */
  async verifyHeaderProof(
    chainId: string,
    blockNumber: bigint,
    blockHash: string,
  ): Promise<any> {
    try {
      this.logger.log(`Verifying header proof for chain ${chainId} block ${blockNumber}`);

      const lightClient = await this.prisma.lightClient.findUnique({
        where: { chainId },
      });

      if (!lightClient) {
        throw new Error(`Light client not found for ${chainId}`);
      }

      // Get active validators for this chain
      const validators = await this.prisma.validator.findMany({
        where: {
          chainId,
          status: 'ACTIVE',
        },
      });

      if (validators.length === 0) {
        this.logger.warn(`No active validators found for chain ${chainId}`);
        return { isVerified: false, reason: 'No active validators' };
      }

      // Calculate required signatures threshold (2/3 of validators)
      const threshold = Math.ceil((validators.length * 2) / 3);

      // In a real implementation, this would:
      // 1. Fetch validator signatures from the chain
      // 2. Verify BLS signatures or similar
      // 3. Check that threshold is met
      // For now, we simulate successful verification if threshold is achievable

      if (validators.length >= threshold) {
        // Create header proof record
        await this.prisma.headerProof.create({
          data: {
            lightClientId: lightClient.id,
            blockNumber,
            blockHash,
            proof: JSON.stringify({
              blockNumber: blockNumber.toString(),
              blockHash,
              validatorCount: validators.length,
              threshold,
            }),
            signerBitmap: this.generateSignerBitmap(validators.length),
            threshold,
            isVerified: true,
            verificationTime: new Date(),
          },
        });

        return {
          isVerified: true,
          blockNumber,
          blockHash,
          threshold,
          validatorCount: validators.length,
        };
      } else {
        return {
          isVerified: false,
          reason: `Insufficient validators: ${validators.length} < ${threshold}`,
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to verify header proof for ${chainId}: ${error.message}`,
      );
      return { isVerified: false, error: error.message };
    }
  }

  /**
   * Get the current validator set root for a chain
   */
  async getValidatorSetRoot(chainId: string): Promise<string> {
    const validators = await this.prisma.validator.findMany({
      where: { chainId, status: 'ACTIVE' },
    });

    if (validators.length === 0) {
      return '0x0000000000000000000000000000000000000000000000000000000000000000';
    }

    // In a real implementation, compute the Merkle root of the validator set
    // For now, hash concatenated validator addresses
    const addressList = validators.map((v) => v.validatorAddress).join('');
    const crypto = require('crypto');
    return '0x' + crypto.createHash('sha256').update(addressList).digest('hex');
  }

  /**
   * Verify that a state or leaf is commitmented in the light client
   */
  async verifyMembership(
    chainId: string,
    leaf: string,
    proof: string[],
  ): Promise<boolean> {
    try {
      const lightClient = await this.prisma.lightClient.findUnique({
        where: { chainId },
      });

      if (!lightClient) {
        throw new Error(`Light client not found for ${chainId}`);
      }

      // Verify Merkle proof
      return this.verifyMerkleProof(leaf, proof, lightClient.commitmentRoot);
    } catch (error) {
      this.logger.error(`Failed to verify membership: ${error.message}`);
      return false;
    }
  }

  /**
   * Sync headers from source chain to destination chain light client
   */
  async syncHeaders(sourceChainId: string, destChainId: string): Promise<any> {
    try {
      const sourceLight = await this.prisma.lightClient.findUnique({
        where: { chainId: sourceChainId },
      });

      if (!sourceLight) {
        throw new Error(`Source light client not found for ${sourceChainId}`);
      }

      let destLight = await this.prisma.lightClient.findUnique({
        where: { chainId: destChainId },
      });

      if (!destLight) {
        // Initialize destination light client first
        await this.updateLightClient(destChainId);
        destLight = await this.prisma.lightClient.findUnique({
          where: { chainId: destChainId },
        });
      }

      // Update destination light client with source chain state
      destLight = await this.prisma.lightClient.update({
        where: { chainId: destChainId },
        data: {
          trustedBlockNumber: sourceLight.latestBlockNumber,
        },
      });

      this.logger.log(
        `Synced headers from ${sourceChainId} to ${destChainId}`,
      );

      return {
        sourceChain: sourceChainId,
        destChain: destChainId,
        syncedBlockNumber: destLight.trustedBlockNumber,
      };
    } catch (error) {
      this.logger.error(`Failed to sync headers: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get light client status for a chain
   */
  async getLightClientStatus(chainId: string): Promise<any> {
    const lightClient = await this.prisma.lightClient.findUnique({
      where: { chainId },
      include: {
        headerProofs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!lightClient) {
      return null;
    }

    return {
      chainId,
      latestBlockNumber: lightClient.latestBlockNumber,
      latestBlockHash: lightClient.latestBlockHash,
      latestBlockTime: lightClient.latestBlockTime,
      verificationCount: lightClient.verificationCount,
      failureCount: lightClient.failureCount,
      successRate:
        lightClient.verificationCount > 0
          ? (
              (lightClient.verificationCount /
                (lightClient.verificationCount + lightClient.failureCount)) *
              100
            ).toFixed(2)
          : '100',
      lastUpdateTime: lightClient.lastUpdateTime,
      recentProofs: lightClient.headerProofs.map((proof) => ({
        blockNumber: proof.blockNumber,
        blockHash: proof.blockHash,
        isVerified: proof.isVerified,
        verificationTime: proof.verificationTime,
      })),
    };
  }

  /**
   * Generate a signer bitmap (simplified version)
   */
  private generateSignerBitmap(validatorCount: number): string {
    // In production, this would be an actual bitmap of which validators signed
    // For now, return a hex string representing all validators signed
    const bytes = Math.ceil(validatorCount / 8);
    return '0x' + 'ff'.repeat(bytes);
  }

  /**
   * Verify a Merkle proof
   */
  private verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
    try {
      const crypto = require('crypto');
      let current = leaf;

      for (const sibling of proof) {
        const combined = current < sibling ? current + sibling : sibling + current;
        current = crypto.createHash('sha256').update(combined).digest('hex');
      }

      return current === root;
    } catch (error) {
      this.logger.error(`Merkle proof verification failed: ${error.message}`);
      return false;
    }
  }
}
