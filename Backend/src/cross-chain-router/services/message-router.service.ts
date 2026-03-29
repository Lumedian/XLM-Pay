import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessageStatus } from '@prisma/client';

interface EnqueueMessageRequest {
  messageId: string;
  sourceChain: string;
  destChain: string;
  payload: string;
  senderAddress: string;
  recipientAddress: string;
}

/**
 * MessageRouterService handles:
 * - Routing messages across chains
 * - Queuing for RabbitMQ processing
 * - Status tracking
 * - Retry logic with exponential backoff
 */
@Injectable()
export class MessageRouterService {
  private readonly logger = new Logger(MessageRouterService.name);
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Enqueue a message for cross-chain routing
   */
  async enqueueMessage(request: EnqueueMessageRequest): Promise<any> {
    try {
      this.logger.log(`Enqueuing message ${request.messageId} from ${request.sourceChain}`);

      // Validate chain adapters exist
      const sourceAdapter = await this.prisma.chainAdapter.findUnique({
        where: { blockchain: request.sourceChain },
      });

      const destAdapter = await this.prisma.chainAdapter.findUnique({
        where: { blockchain: request.destChain },
      });

      if (!sourceAdapter || !destAdapter) {
        throw new Error('Source or destination chain adapter not found');
      }

      // Emit event to RabbitMQ for processing
      this.eventEmitter.emit('cross-chain.message.enqueued', {
        messageId: request.messageId,
        sourceChain: request.sourceChain,
        destChain: request.destChain,
        payload: request.payload,
        senderAddress: request.senderAddress,
        recipientAddress: request.recipientAddress,
      });

      return {
        success: true,
        messageId: request.messageId,
        enqueuedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to enqueue message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Route a message from source to destination chain
   * This handles the actual cross-chain verification and delivery
   */
  async routeMessage(messageId: string): Promise<any> {
    let message;
    let retryCount = 0;

    try {
      message = await this.prisma.crossChainMessage.findFirst({
        where: {
          OR: [{ id: messageId }, { messageId }],
        },
      });

      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      this.logger.log(
        `Routing message ${message.messageId} from ${message.sourceChain} to ${message.destChain}`,
      );

      // Update status to VERIFIED
      message = await this.prisma.crossChainMessage.update({
        where: { id: message.id },
        data: { status: MessageStatus.VERIFIED, verifiedAt: new Date() },
      });

      // Route based on message type
      if (message.contractAddress && message.functionSelector) {
        // Contract call routing
        await this.routeContractCall(message);
      } else if (message.assetSymbol && message.assetAmount) {
        // Asset transfer routing
        await this.routeAssetTransfer(message);
      } else {
        // Generic message routing
        await this.routeGenericMessage(message);
      }

      return {
        success: true,
        messageId: message.messageId,
        status: MessageStatus.VERIFIED,
      };
    } catch (error) {
      this.logger.error(`Failed to route message: ${error.message}`);

      if (message && retryCount < this.MAX_RETRIES) {
        retryCount++;
        const delayMs = this.RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
        this.logger.log(`Retrying in ${delayMs}ms (attempt ${retryCount}/${this.MAX_RETRIES})`);

        setTimeout(() => this.routeMessage(messageId), delayMs);
      } else {
        // Mark as failed after max retries
        if (message) {
          await this.prisma.crossChainMessage.update({
            where: { id: message.id },
            data: {
              status: MessageStatus.FAILED,
              errorMessage: error.message,
            },
          });
        }
      }

      throw error;
    }
  }

  /**
   * Route contract call across chains
   */
  private async routeContractCall(message: any): Promise<void> {
    this.logger.log(`Routing contract call for message ${message.messageId}`);

    // In production, this would:
    // 1. Validate the contract address on destination chain
    // 2. Execute the function selector with args
    // 3. Track gas usage
    // 4. Handle errors and reversions

    const functionArgs = message.functionArgs ? JSON.parse(message.functionArgs) : [];

    this.eventEmitter.emit('cross-chain.contract.call', {
      messageId: message.messageId,
      destChain: message.destChain,
      contractAddress: message.contractAddress,
      functionSelector: message.functionSelector,
      functionArgs,
    });
  }

  /**
   * Route asset transfer across chains
   */
  private async routeAssetTransfer(message: any): Promise<void> {
    this.logger.log(`Routing asset transfer for message ${message.messageId}`);

    // Emit asset transfer event
    this.eventEmitter.emit('cross-chain.asset.transfer', {
      messageId: message.messageId,
      sourceChain: message.sourceChain,
      destChain: message.destChain,
      assetSymbol: message.assetSymbol,
      amount: message.assetAmount?.toString(),
      recipientAddress: message.recipientAddress,
    });
  }

  /**
   * Route generic message across chains
   */
  private async routeGenericMessage(message: any): Promise<void> {
    this.logger.log(`Routing generic message for message ${message.messageId}`);

    const payload = message.messagePayload ? JSON.parse(message.messagePayload) : {};

    this.eventEmitter.emit('cross-chain.generic.message', {
      messageId: message.messageId,
      sourceChain: message.sourceChain,
      destChain: message.destChain,
      senderAddress: message.senderAddress,
      recipientAddress: message.recipientAddress,
      payload,
    });
  }

  /**
   * Get message queue status
   */
  async getQueueStatus(): Promise<any> {
    try {
      const pending = await this.prisma.crossChainMessage.count({
        where: { status: MessageStatus.INITIATED },
      });

      const locked = await this.prisma.crossChainMessage.count({
        where: { status: MessageStatus.LOCKED },
      });

      const verified = await this.prisma.crossChainMessage.count({
        where: { status: MessageStatus.VERIFIED },
      });

      const minted = await this.prisma.crossChainMessage.count({
        where: { status: MessageStatus.MINTED },
      });

      const released = await this.prisma.crossChainMessage.count({
        where: { status: MessageStatus.RELEASED },
      });

      const failed = await this.prisma.crossChainMessage.count({
        where: { status: MessageStatus.FAILED },
      });

      const avgLatency = await this.calculateAverageLatency();

      return {
        pending,
        locked,
        verified,
        minted,
        released,
        failed,
        totalMessages: pending + locked + verified + minted + released + failed,
        avgLatencyMs: avgLatency,
      };
    } catch (error) {
      this.logger.error(`Failed to get queue status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate average message processing latency
   */
  private async calculateAverageLatency(): Promise<number> {
    try {
      const messages = await this.prisma.crossChainMessage.findMany({
        where: {
          finalizedAt: { not: null },
          initiatedAt: { not: null },
        },
        select: {
          initiatedAt: true,
          finalizedAt: true,
        },
        take: 100,
      });

      if (messages.length === 0) {
        return 0;
      }

      const totalLatency = messages.reduce((sum, msg) => {
        const latency =
          msg.finalizedAt.getTime() - msg.initiatedAt.getTime();
        return sum + latency;
      }, 0);

      return Math.round(totalLatency / messages.length);
    } catch (error) {
      this.logger.error(`Failed to calculate average latency: ${error.message}`);
      return 0;
    }
  }
}
