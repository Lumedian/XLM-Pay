import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LightClientService } from './light-client.service';
import { ValidatorService } from './validator.service';
import { MessageRouterService } from './message-router.service';
import { AssetBridgeService } from './asset-bridge.service';
import { ChainAdapterService } from './chain-adapter.service';
import { FinalizationDetectorService } from './finalization-detector.service';
import { CreateCrossChainMessageDto } from '../dto/create-cross-chain-message.dto';
import { MessageStatus, SupportedBlockchain } from '@prisma/client';
import * as ethers from 'ethers';
import * as crypto from 'crypto';

interface RouteQuery {
  sourceChain: SupportedBlockchain;
  destChain: SupportedBlockchain;
  assetSymbol?: string;
  amount?: string;
}

@Injectable()
export class CrossChainRouterService {
  private readonly logger = new Logger(CrossChainRouterService.name);
  private readonly MESSAGE_TIMEOUT_MS = 600000; // 10 minutes for <10 minute SLA

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly lightClientService: LightClientService,
    private readonly validatorService: ValidatorService,
    private readonly messageRouterService: MessageRouterService,
    private readonly assetBridgeService: AssetBridgeService,
    private readonly chainAdapterService: ChainAdapterService,
    private readonly finalizationDetectorService: FinalizationDetectorService,
  ) {}

  /**
   * Initiate a cross-chain message with support for:
   * - Arbitrary message passing
   * - Asset transfers (lock-and-mint or burn-and-release)
   * - Contract calls across chains
   */
  async initiateMessage(dto: CreateCrossChainMessageDto): Promise<any> {
    try {
      this.logger.log(
        `Initiating cross-chain message from ${dto.sourceChain} to ${dto.destChain}`,
      );

      // Validate source and destination chains
      await this.validateChainSupport(dto.sourceChain);
      await this.validateChainSupport(dto.destChain);

      // Verify routes exist and are active
      const route = await this.prisma.crossChainRoute.findUnique({
        where: {
          sourceChain_destChain: {
            sourceChain: dto.sourceChain,
            destChain: dto.destChain,
          },
        },
      });

      if (!route || !route.isActive) {
        throw new BadRequestException(
          `Route from ${dto.sourceChain} to ${dto.destChain} is not active`,
        );
      }

      // Generate unique message ID
      const messageId = this.generateMessageId();
      const messageHash = this.hashMessage(dto);
      const nonce = BigInt(Date.now());

      // Create message record
      const message = await this.prisma.crossChainMessage.create({
        data: {
          messageId,
          messageHash,
          sourceChain: dto.sourceChain,
          destChain: dto.destChain,
          senderAddress: dto.senderAddress,
          recipientAddress: dto.recipientAddress,
          messagePayload: JSON.stringify(dto.payload),
          status: MessageStatus.INITIATED,
          nonce,
          sequenceNumber: nonce,
          assetSymbol: dto.assetSymbol,
          assetAmount: dto.assetAmount ? BigInt(dto.assetAmount) : null,
          contractAddress: dto.contractAddress,
          functionSelector: dto.functionSelector,
          functionArgs: dto.functionArgs ? JSON.stringify(dto.functionArgs) : null,
        },
      });

      this.logger.log(`Message created: ${message.id} (${messageId})`);

      // Emit event for message initiation
      this.eventEmitter.emit('cross-chain.message.initiated', {
        messageId: message.id,
        sourceChain: dto.sourceChain,
        destChain: dto.destChain,
      });

      // If asset transfer, lock the asset on source chain
      if (dto.assetSymbol && dto.assetAmount) {
        await this.assetBridgeService.lockAsset({
          messageId: message.id,
          assetSymbol: dto.assetSymbol,
          amount: dto.assetAmount,
          sourceChain: dto.sourceChain,
          recipientAddress: dto.recipientAddress,
        });
      }

      // Route message and update status to LOCKED
      await this.messageRouterService.enqueueMessage({
        messageId: message.id,
        sourceChain: dto.sourceChain,
        destChain: dto.destChain,
        payload: message.messagePayload,
        senderAddress: dto.senderAddress,
        recipientAddress: dto.recipientAddress,
      });

      // Update message status
      await this.prisma.crossChainMessage.update({
        where: { id: message.id },
        data: { status: MessageStatus.LOCKED, lockedAt: new Date() },
      });

      return {
        messageId: message.messageId,
        internalId: message.id,
        status: MessageStatus.LOCKED,
        sourceChain: dto.sourceChain,
        destChain: dto.destChain,
        estimatedLatency: route.estimatedLatency,
      };
    } catch (error) {
      this.logger.error(`Failed to initiate message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Query message status across all chains
   */
  async queryMessageStatus(messageId: string): Promise<any> {
    const message = await this.prisma.crossChainMessage.findFirst({
      where: {
        OR: [{ id: messageId }, { messageId }],
      },
      include: {
        receipts: true,
        routerEvents: true,
      },
    });

    if (!message) {
      throw new BadRequestException(`Message not found: ${messageId}`);
    }

    return {
      messageId: message.messageId,
      status: message.status,
      sourceChain: message.sourceChain,
      destChain: message.destChain,
      finalized: message.sourceFinalized && message.destFinalized,
      receipts: message.receipts,
      events: message.routerEvents,
      executionTime: message.executionTime,
      gasUsed: message.gasUsed,
      createdAt: message.initiatedAt,
      finalizedAt: message.finalizedAt,
    };
  }

  /**
   * Get recommended route between two chains with latency and fee estimation
   */
  async queryRoute(query: RouteQuery): Promise<any> {
    try {
      const route = await this.prisma.crossChainRoute.findUnique({
        where: {
          sourceChain_destChain: {
            sourceChain: query.sourceChain,
            destChain: query.destChain,
          },
        },
      });

      if (!route) {
        throw new BadRequestException(
          `No route available from ${query.sourceChain} to ${query.destChain}`,
        );
      }

      // Calculate fees if amount is provided
      let estimatedFee = 0;
      if (query.amount) {
        estimatedFee = parseFloat(query.amount) * Number(route.fee);
      }

      return {
        sourceChain: route.sourceChain,
        destChain: route.destChain,
        fee: Number(route.fee),
        estimatedFeeAmount: estimatedFee,
        estimatedLatency: route.estimatedLatency,
        estimatedLatencySeconds: Math.ceil(route.estimatedLatency / 1000),
        successRate: Number(route.successRate),
        isActive: route.isActive,
      };
    } catch (error) {
      this.logger.error(`Failed to query route: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all supported chains
   */
  async getSupportedChains(): Promise<any[]> {
    try {
      const adapters = await this.prisma.chainAdapter.findMany({
        where: { isActive: true },
      });

      return adapters.map((adapter) => ({
        blockchain: adapter.blockchain,
        chainId: adapter.chainId,
        rpcEndpoint: adapter.rpcEndpoint,
        isHealthy: adapter.isHealthy,
        lastHeartbeat: adapter.lastHeartbeat,
        avgBlockTime: adapter.avgBlockTime,
        finalityBlocks: adapter.finalityBlocks,
      }));
    } catch (error) {
      this.logger.error(`Failed to get supported chains: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all active routes
   */
  async getRoutes(): Promise<any[]> {
    try {
      const routes = await this.prisma.crossChainRoute.findMany({
        where: { isActive: true },
      });

      return routes.map((route) => ({
        sourceChain: route.sourceChain,
        destChain: route.destChain,
        fee: Number(route.fee),
        estimatedLatency: route.estimatedLatency,
        successRate: Number(route.successRate),
        messagesProcessed: route.messagesCount,
        lastMessageTime: route.lastMessageTime,
      }));
    } catch (error) {
      this.logger.error(`Failed to get routes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate that a blockchain is supported
   */
  private async validateChainSupport(blockchain: SupportedBlockchain): Promise<void> {
    const adapter = await this.prisma.chainAdapter.findUnique({
      where: { blockchain },
    });

    if (!adapter) {
      throw new BadRequestException(`Chain ${blockchain} is not supported`);
    }

    if (!adapter.isActive) {
      throw new BadRequestException(`Chain ${blockchain} is currently inactive`);
    }

    if (!adapter.isHealthy) {
      throw new BadRequestException(`Chain ${blockchain} is unhealthy`);
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Hash message for verification
   */
  private hashMessage(dto: CreateCrossChainMessageDto): string {
    const data = JSON.stringify({
      sourceChain: dto.sourceChain,
      destChain: dto.destChain,
      senderAddress: dto.senderAddress,
      recipientAddress: dto.recipientAddress,
      payload: dto.payload,
      timestamp: Date.now(),
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Initialize or update light clients for all supported chains
   */
  async initializeLightClients(): Promise<void> {
    const adapters = await this.prisma.chainAdapter.findMany({
      where: { isActive: true },
    });

    for (const adapter of adapters) {
      try {
        await this.lightClientService.updateLightClient(adapter.chainId);
      } catch (error) {
        this.logger.error(
          `Failed to initialize light client for ${adapter.blockchain}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Initialize validator set for a chain
   */
  async initializeValidatorSet(chainId: string): Promise<void> {
    try {
      await this.validatorService.initializeValidatorSet(chainId);
    } catch (error) {
      this.logger.error(`Failed to initialize validator set for ${chainId}: ${error.message}`);
    }
  }

  /**
   * Get message history for an address
   */
  async getMessageHistoryForAddress(address: string, limit: number = 50): Promise<any[]> {
    const messages = await this.prisma.crossChainMessage.findMany({
      where: {
        OR: [{ senderAddress: address }, { recipientAddress: address }],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return messages.map((msg) => ({
      messageId: msg.messageId,
      status: msg.status,
      sourceChain: msg.sourceChain,
      destChain: msg.destChain,
      assetSymbol: msg.assetSymbol,
      assetAmount: msg.assetAmount?.toString(),
      createdAt: msg.initiatedAt,
      finalizedAt: msg.finalizedAt,
    }));
  }
}
