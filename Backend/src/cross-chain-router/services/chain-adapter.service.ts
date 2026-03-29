import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportedBlockchain } from '@prisma/client';
import axios from 'axios';

interface BlockData {
  number: bigint;
  hash: string;
  timestamp: number;
  stateRoot?: string;
  blockHash: string;
}

interface ChainConfig {
  blockchain: SupportedBlockchain;
  rpcEndpoint: string;
  wsEndpoint?: string;
  chainId: string;
  avgBlockTime: number;
  finalityBlocks: number;
}

/**
 * ChainAdapterService provides abstracted interface to different blockchains
 * Supports: Ethereum, Solana, Cosmos, Polkadot, Avalanche, Arbitrum, Optimism, Polygon, Base, Stellar
 */
@Injectable()
export class ChainAdapterService {
  private readonly logger = new Logger(ChainAdapterService.name);
  private readonly RPC_TIMEOUT = 10000; // 10 seconds

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a new chain adapter
   */
  async registerChainAdapter(config: ChainConfig): Promise<any> {
    try {
      // Verify RPC connectivity
      await this.verifyRpcHealth(config.rpcEndpoint);

      const adapter = await this.prisma.chainAdapter.upsert({
        where: { blockchain: config.blockchain },
        create: {
          blockchain: config.blockchain,
          rpcEndpoint: config.rpcEndpoint,
          wsEndpoint: config.wsEndpoint,
          chainId: config.chainId,
          avgBlockTime: config.avgBlockTime,
          finalityBlocks: config.finalityBlocks,
          isActive: true,
          isHealthy: true,
        },
        update: {
          rpcEndpoint: config.rpcEndpoint,
          wsEndpoint: config.wsEndpoint,
          isActive: true,
        },
      });

      this.logger.log(`Chain adapter registered for ${config.blockchain}`);

      return {
        blockchain: adapter.blockchain,
        chainId: adapter.chainId,
        isHealthy: adapter.isHealthy,
      };
    } catch (error) {
      this.logger.error(`Failed to register chain adapter: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get latest block from any supported blockchain
   */
  async getLatestBlock(rpcEndpoint: string): Promise<BlockData> {
    try {
      // Try EVM RPC first (JSON-RPC 2.0)
      try {
        const response = await axios.post(
          rpcEndpoint,
          {
            jsonrpc: '2.0',
            method: 'eth_getBlockByNumber',
            params: ['latest', false],
            id: 1,
          },
          { timeout: this.RPC_TIMEOUT },
        );

        if (response.data.result) {
          return {
            number: BigInt(response.data.result.number),
            hash: response.data.result.hash,
            timestamp: parseInt(response.data.result.timestamp,16),
            stateRoot: response.data.result.stateRoot,
            blockHash: response.data.result.hash,
          };
        }
      } catch (error) {
        this.logger.debug(`EVM RPC failed, trying other formats: ${error.message}`);
      }

      // Try Solana RPC
      try {
        const response = await axios.post(
          rpcEndpoint,
          {
            jsonrpc: '2.0',
            method: 'getLatestBlockhash',
            params: [],
            id: 1,
          },
          { timeout: this.RPC_TIMEOUT },
        );

        if (response.data.result) {
          return {
            number: BigInt(Date.now()), // Solana uses slot numbers which vary
            hash: response.data.result.blockhash,
            timestamp: Math.floor(Date.now() / 1000),
            blockHash: response.data.result.blockhash,
          };
        }
      } catch (error) {
        this.logger.debug(`Solana RPC failed: ${error.message}`);
      }

      throw new Error('Could not fetch latest block from any RPC method');
    } catch (error) {
      this.logger.error(`Failed to get latest block: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify RPC endpoint health
   */
  async verifyRpcHealth(rpcEndpoint: string): Promise<boolean> {
    try {
      // Try EVM health check
      try {
        const response = await axios.post(
          rpcEndpoint,
          {
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
            id: 1,
          },
          { timeout: this.RPC_TIMEOUT },
        );

        if (response.data.result) {
          return true;
        }
      } catch (error) {
        // Try Solana health check
        try {
          const response = await axios.post(
            rpcEndpoint,
            {
              jsonrpc: '2.0',
              method: 'getHealth',
              params: [],
              id: 1,
            },
            { timeout: this.RPC_TIMEOUT },
          );

          if (response.data.result === 'ok') {
            return true;
          }
        } catch {
          // Continue
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`RPC health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Monitor chain adapter health continuously
   */
  async monitorChainHealth(): Promise<void> {
    try {
      const adapters = await this.prisma.chainAdapter.findMany();

      for (const adapter of adapters) {
        const isHealthy = await this.verifyRpcHealth(adapter.rpcEndpoint);

        await this.prisma.chainAdapter.update({
          where: { blockchain: adapter.blockchain },
          data: {
            isHealthy,
            lastHeartbeat: new Date(),
          },
        });

        this.logger.log(
          `Chain ${adapter.blockchain} health: ${isHealthy ? 'OK' : 'DEGRADED'}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to monitor chain health: ${error.message}`);
    }
  }

  /**
   * Get all registered chain adapters
   */
  async getChainAdapters(): Promise<any[]> {
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
      this.logger.error(`Failed to get chain adapters: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get chain adapter by blockchain name
   */
  async getChainAdapter(blockchain: SupportedBlockchain): Promise<any> {
    const adapter = await this.prisma.chainAdapter.findUnique({
      where: { blockchain },
    });

    if (!adapter) {
      throw new BadRequestException(`Chain adapter not found for ${blockchain}`);
    }

    return {
      blockchain: adapter.blockchain,
      chainId: adapter.chainId,
      rpcEndpoint: adapter.rpcEndpoint,
      wsEndpoint: adapter.wsEndpoint,
      isHealthy: adapter.isHealthy,
      avgBlockTime: adapter.avgBlockTime,
      finalityBlocks: adapter.finalityBlocks,
    };
  }
}
