import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessageStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

interface LockAssetRequest {
  messageId: string;
  assetSymbol: string;
  amount: string;
  sourceChain: string;
  recipientAddress: string;
}

interface MintAssetRequest {
  messageId: string;
  assetSymbol: string;
  amount: string;
  destChain: string;
  recipientAddress: string;
}

/**
 * AssetBridgeService handles lock-and-mint and burn-and-release asset transfers
 */
@Injectable()
export class AssetBridgeService {
  private readonly logger = new Logger(AssetBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Lock assets on source chain in preparation for cross-chain transfer
   */
  async lockAsset(request: LockAssetRequest): Promise<any> {
    try {
      this.logger.log(
        `Locking ${request.amount} ${request.assetSymbol} on ${request.sourceChain}`,
      );

      // Get or create bridged asset
      let bridgedAsset = await this.prisma.bridgedAsset.findUnique({
        where: {
          assetSymbol_sourceChain: {
            assetSymbol: request.assetSymbol,
            sourceChain: request.sourceChain,
          },
        },
      });

      if (!bridgedAsset) {
        // Create new bridged asset
        const adapter = await this.prisma.chainAdapter.findUnique({
          where: { blockchain: request.sourceChain },
        });

        if (!adapter) {
          throw new BadRequestException(`Chain adapter not found for ${request.sourceChain}`);
        }

        bridgedAsset = await this.prisma.bridgedAsset.create({
          data: {
            assetSymbol: request.assetSymbol,
            sourceChain: request.sourceChain,
            sourceTokenAddress: '', // Would be set from contract
            totalLocked: new Decimal(request.amount),
            bridgeMode: 'lock-and-mint',
          },
        });
      } else {
        // Update locked amount
        bridgedAsset = await this.prisma.bridgedAsset.update({
          where: { id: bridgedAsset.id },
          data: {
            totalLocked: bridgedAsset.totalLocked.plus(new Decimal(request.amount)),
          },
        });
      }

      // Update message with lock info
      await this.prisma.crossChainMessage.update({
        where: { id: request.messageId },
        data: {
          status: MessageStatus.LOCKED,
          lockTxHash: this.generateTxHash(),
          lockedAt: new Date(),
        },
      });

      this.eventEmitter.emit('asset.locked', {
        messageId: request.messageId,
        assetSymbol: request.assetSymbol,
        amount: request.amount,
        sourceChain: request.sourceChain,
        bridgedAssetId: bridgedAsset.id,
      });

      return {
        success: true,
        bridgedAssetId: bridgedAsset.id,
        lockedAmount: bridgedAsset.totalLocked.toString(),
        lockTxHash: request.messageId,
      };
    } catch (error) {
      this.logger.error(`Failed to lock asset: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mint equivalent assets on destination chain
   */
  async mintAsset(request: MintAssetRequest): Promise<any> {
    try {
      this.logger.log(
        `Minting ${request.amount} ${request.assetSymbol} on ${request.destChain}`,
      );

      // Update message status to MINTED
      const message = await this.prisma.crossChainMessage.update({
        where: { id: request.messageId },
        data: {
          status: MessageStatus.MINTED,
        },
      });

      this.eventEmitter.emit('asset.minted', {
        messageId: request.messageId,
        assetSymbol:request.assetSymbol,
        amount: request.amount,
        destChain: request.destChain,
        recipientAddress: request.recipientAddress,
      });

      return {
        success: true,
        messageId: request.messageId,
        mintedAmount: request.amount,
        recipientAddress: request.recipientAddress,
      };
    } catch (error) {
      this.logger.error(`Failed to mint asset: ${error.message}`);
      throw error;
    }
  }

  /**
   * Release locked assets (used when message fails)
   */
  async releaseAsset(messageId: string): Promise<any> {
    try {
      this.logger.log(`Releasing assets for message ${messageId}`);

      const message = await this.prisma.crossChainMessage.findFirst({
        where: {
          OR: [{ id: messageId }, { messageId }],
        },
      });

      if (!message) {
        throw new BadRequestException(`Message not found: ${messageId}`);
      }

      // Update locked asset
      if (message.assetSymbol) {
        const bridgedAsset = await this.prisma.bridgedAsset.findUnique({
          where: {
            assetSymbol_sourceChain: {
              assetSymbol: message.assetSymbol,
              sourceChain: message.sourceChain,
            },
          },
        });

        if (bridgedAsset && message.assetAmount) {
          const newTotalLocked = bridgedAsset.totalLocked.minus(message.assetAmount);
          await this.prisma.bridgedAsset.update({
            where: { id: bridgedAsset.id },
            data: {
              totalLocked: newTotalLocked.gte(0) ? newTotalLocked : new Decimal(0),
            },
          });
        }
      }

      // Update message status
      await this.prisma.crossChainMessage.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.RELEASED,
          releaseTxHash: this.generateTxHash(),
        },
      });

      this.eventEmitter.emit('asset.released', {
        messageId: message.messageId,
        assetSymbol: message.assetSymbol,
        amount: message.assetAmount?.toString(),
        sourceChain: message.sourceChain,
      });

      return {
        success: true,
        messageId: message.messageId,
        releasedAmount: message.assetAmount?.toString(),
      };
    } catch (error) {
      this.logger.error(`Failed to release asset: ${error.message}`);
      throw error;
    }
  }

  /**
   * Burn assets on source chain (for burn-and-release model)
   */
  async burnAsset(messageId: string, assetSymbol: string, amount: string): Promise<any> {
    try {
      this.logger.log(`Burning ${amount} ${assetSymbol}`);

      const message = await this.prisma.crossChainMessage.findFirst({
        where: {
          OR: [{ id: messageId }, { messageId }],
        },
      });

      if (!message) {
        throw new BadRequestException(`Message not found: ${messageId}`);
      }

      this.eventEmitter.emit('asset.burned', {
        messageId,
        assetSymbol,
        amount,
        sourceChain: message.sourceChain,
      });

      return {
        success: true,
        burned: amount,
        assetSymbol,
      };
    } catch (error) {
      this.logger.error(`Failed to burn asset: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get bridged asset details
   */
  async getBridgedAsset(assetSymbol: string, sourceChain: string): Promise<any> {
    const asset = await this.prisma.bridgedAsset.findUnique({
      where: {
        assetSymbol_sourceChain: {
          assetSymbol,
          sourceChain,
        },
      },
    });

    if (!asset) {
      throw new BadRequestException(
        `Bridged asset not found: ${assetSymbol} from ${sourceChain}`,
      );
    }

    return {
      id: asset.id,
      assetSymbol: asset.assetSymbol,
      sourceChain: asset.sourceChain,
      sourceTokenAddress: asset.sourceTokenAddress,
      totalLocked: asset.totalLocked.toString(),
      totalMinted: asset.totalMinted.toString(),
      decimals: asset.decimals,
      bridgeMode: asset.bridgeMode,
      isActive: asset.isActive,
    };
  }

  /**
   * Get all bridged assets
   */
  async getBridgedAssets(): Promise<any[]> {
    const assets = await this.prisma.bridgedAsset.findMany({
      where: { isActive: true },
    });

    return assets.map((asset) => ({
      assetSymbol: asset.assetSymbol,
      sourceChain: asset.sourceChain,
      totalLocked: asset.totalLocked.toString(),
      totalMinted: asset.totalMinted.toString(),
      bridgeMode: asset.bridgeMode,
    }));
  }

  /**
   * Generate simulated transaction hash
   */
  private generateTxHash(): string {
    return '0x' + Math.random().toString(16).substr(2) + Date.now().toString(16);
  }
}
