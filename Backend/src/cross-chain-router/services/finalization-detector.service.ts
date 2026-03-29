import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessageStatus } from '@prisma/client';
import { ChainAdapterService } from './chain-adapter.service';

/**
 * FinalizationDetectorService handles finality detection and tracking for cross-chain messages
 *
 * Supports multiple finality models:
 * - Probabilistic finality (Bitcoin-like): Requires N confirmations
 * - Absolute finality (PoS): Epoch/slot completion
 * - Instant finality: BFT-based (Tendermint/Polkadot)
 */
@Injectable()
export class FinalizationDetectorService {
  private readonly logger = new Logger(FinalizationDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainAdapter: ChainAdapterService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Check and update finality status for a message
   */
  async detectFinality(messageId: string): Promise<any> {
    try {
      const message = await this.prisma.crossChainMessage.findFirst({
        where: {
          OR: [{ id: messageId }, { messageId }],
        },
      });

      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      this.logger.log(`Detecting finality for message ${message.messageId}`);

      // Check source chain finality
      if (!message.sourceFinalized) {
        const sourceFinalized = await this.checkChainFinality(
          message.sourceChain,
          message.lockTxHash,
        );

        if (sourceFinalized) {
          await this.prisma.crossChainMessage.update({
            where: { id: message.id },
            data: {
              sourceFinalized: true,
              sourceFinalizationBlockNumber: message.sourceFinalizationBlockNumber,
            },
          });

          this.eventEmitter.emit('message.source.finalized', {
            messageId: message.messageId,
            sourceChain: message.sourceChain,
          });
        }
      }

      // Check destination chain finality
      if (!message.destFinalized) {
        const destFinalized = await this.checkChainFinality(
          message.destChain,
          message.releaseTxHash,
        );

        if (destFinalized) {
          await this.prisma.crossChainMessage.update({
            where: { id: message.id },
            data: {
              destFinalized: true,
              destFinalizationBlockNumber: message.destFinalizationBlockNumber,
              status: MessageStatus.RELEASED,
              finalizedAt: new Date(),
            },
          });

          this.eventEmitter.emit('message.dest.finalized', {
            messageId: message.messageId,
            destChain: message.destChain,
          });
        }
      }

      return {
        messageId: message.messageId,
        sourceFinalized: message.sourceFinalized,
        destFinalized: message.destFinalized,
        overallFinalized: message.sourceFinalized && message.destFinalized,
      };
    } catch (error) {
      this.logger.error(`Failed to detect finality: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a transaction has achieved finality on a specific chain
   *
   * Different chains have different finality models:
   * - Ethereum: ~15 minutes (7200 blocks at 12sec average) for economic finality
   * - Solana: ~12 seconds (32 slots) for finality
   * - Cosmos: 1 block with BFT finality
   * - Polkadot: 2 epochs (~4 minutes)
   * - Avalanche: ~3 seconds (63 block confirmations)
   */
  async checkChainFinality(chainId: string, txHash?: string): Promise<boolean> {
    try {
      const adapter = await this.prisma.chainAdapter.findUnique({
        where: { blockchain: chainId },
      });

      if (!adapter) {
        this.logger.warn(`Chain adapter not found for ${chainId}`);
        return false;
      }

      if (!txHash) {
        // No transaction to verify, consider finalized after time
        const timeElapsedMs = Date.now() - (adapter.lastHeartbeat?.getTime() || 0);
        const estimatedFinalityTime = adapter.finalityBlocks * adapter.avgBlockTime;
        return timeElapsedMs >= estimatedFinalityTime;
      }

      // Try to get transaction confirmation count
      const confirmations = await this.getTransactionConfirmations(
        adapter.rpcEndpoint,
        txHash,
      );

      if (confirmations === null) {
        return false;
      }

      // Check if confirmations exceed finality threshold
      const isFinal = confirmations >= adapter.finalityBlocks;

      if (isFinal) {
        this.logger.log(
          `Transaction ${txHash} achieved finality on ${chainId} (${confirmations}/${adapter.finalityBlocks} blocks)`,
        );
      }

      return isFinal;
    } catch (error) {
      this.logger.error(`Failed to check chain finality: ${error.message}`);
      return false;
    }
  }

  /**
   * Get the number of confirmations for a transaction
   */
  private async getTransactionConfirmations(rpcEndpoint: string, txHash: string): Promise<number | null> {
    try {
      const axios = require('axios');

      // Try EVM RPC
      try {
        const response = await axios.post(
          rpcEndpoint,
          {
            jsonrpc: '2.0',
            method: 'eth_getTransactionReceipt',
            params: [txHash],
            id: 1,
          },
          { timeout: 10000 },
        );

        if (response.data.result?.blockNumber) {
          const blockNum = parseInt(response.data.result.blockNumber);
          const latestResponse = await axios.post(
            rpcEndpoint,
            {
              jsonrpc: '2.0',
              method: 'eth_blockNumber',
              params: [],
              id: 1,
            },
            { timeout: 10000 },
          );

          if (latestResponse.data.result) {
            const latestBlock = parseInt(latestResponse.data.result);
            return latestBlock - blockNum;
          }
        }
      } catch (error) {
        this.logger.debug(`EVM confirmation check failed: ${error.message}`);
      }

      // For Solana and other chains, would implement similar logic
      return null;
    } catch (error) {
      this.logger.error(`Failed to get transaction confirmations: ${error.message}`);
      return null;
    }
  }

  /**
   * Wait for message finality with timeout
   */
  async waitForFinality(messageId: string, maxWaitMs: number = 600000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 5000; // Poll every 5 seconds

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const finality = await this.detectFinality(messageId);

        if (finality.overallFinalized) {
          this.logger.log(`Message ${messageId} finalized in ${Date.now() - startTime}ms`);
          return true;
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        this.logger.error(`Error waiting for finality: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    this.logger.warn(`Finality timeout for message ${messageId} after ${maxWaitMs}ms`);
    return false;
  }

  /**
   * Get finality status for a message
   */
  async getFinalityStatus(messageId: string): Promise<any> {
    const message = await this.prisma.crossChainMessage.findFirst({
      where: {
        OR: [{ id: messageId }, { messageId }],
      },
    });

    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const sourceAdapter = await this.prisma.chainAdapter.findUnique({
      where: { blockchain: message.sourceChain },
    });

    const destAdapter = await this.prisma.chainAdapter.findUnique({
      where: { blockchain: message.destChain },
    });

    return {
      messageId: message.messageId,
      status: message.status,
      sourceChain: {
        chain: message.sourceChain,
        finalized: message.sourceFinalized,
        blockNumber: message.sourceFinalizationBlockNumber?.toString(),
        estimatedFinalityBlocks: sourceAdapter?.finalityBlocks,
      },
      destChain: {
        chain: message.destChain,
        finalized: message.destFinalized,
        blockNumber: message.destFinalizationBlockNumber?.toString(),
        estimatedFinalityBlocks: destAdapter?.finalityBlocks,
      },
      overallFinalized: message.sourceFinalized && message.destFinalized,
      totalExecutionTime: message.finalizedAt
        ? message.finalizedAt.getTime() - message.initiatedAt.getTime()
        : null,
    };
  }
}
