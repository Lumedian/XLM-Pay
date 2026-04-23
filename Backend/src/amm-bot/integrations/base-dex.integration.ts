import { Injectable } from '@nestjs/common';
import { DexIntegration, DexConfig, PoolData, AddLiquidityParams, RemoveLiquidityParams, TransactionResult, FeeCollection, PositionData } from '../interfaces/dex-integration.interface';
import { DexType } from '../interfaces/amm-bot.interface';

@Injectable()
export abstract class BaseDexIntegration implements DexIntegration {
  abstract type: DexType;
  abstract name: string;
  protected config: DexConfig;

  async initialize(config: DexConfig): Promise<void> {
    this.config = config;
    await this.validateConfig();
    await this.setupConnection();
  }

  abstract getPoolData(token0: string, token1: string): Promise<PoolData>;
  abstract addLiquidity(params: AddLiquidityParams): Promise<TransactionResult>;
  abstract removeLiquidity(params: RemoveLiquidityParams): Promise<TransactionResult>;
  abstract collectFees(positionId: string): Promise<FeeCollection>;
  abstract getPositionData(positionId: string): Promise<PositionData>;
  abstract getCurrentPrice(token0: string, token1: string): Promise<number>;
  abstract getSupportedTokens(): Promise<string[]>;

  protected abstract validateConfig(): Promise<void>;
  protected abstract setupConnection(): Promise<void>;

  protected calculateMinAmounts(amount0: number, amount1: number, maxSlippage: number): { minAmount0: number; minAmount1: number } {
    const slippageMultiplier = 1 - (maxSlippage / 100);
    return {
      minAmount0: amount0 * slippageMultiplier,
      minAmount1: amount1 * slippageMultiplier
    };
  }

  protected async executeTransaction(transactionData: any): Promise<TransactionResult> {
    try {
      // Simulate transaction execution
      // In real implementation, this would interact with the blockchain
      const hash = this.generateTransactionHash();
      
      return {
        hash,
        status: 'SUCCESS',
        gasUsed: this.estimateGas(transactionData)
      };
    } catch (error) {
      return {
        hash: '',
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  protected generateTransactionHash(): string {
    return '0x' + Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  protected estimateGas(transactionData: any): number {
    // Basic gas estimation - would be more sophisticated in real implementation
    return 200000 + Math.floor(Math.random() * 100000);
  }

  protected validateTokenPair(token0: string, token1: string): void {
    if (!token0 || !token1) {
      throw new Error('Both token addresses must be provided');
    }
    if (token0 === token1) {
      throw new Error('Token addresses must be different');
    }
  }

  protected validateAmounts(amount0: number, amount1: number): void {
    if (amount0 <= 0 || amount1 <= 0) {
      throw new Error('Amounts must be greater than 0');
    }
  }

  protected validateTickRange(tickLower?: number, tickUpper?: number): void {
    if (tickLower !== undefined && tickUpper !== undefined) {
      if (tickLower >= tickUpper) {
        throw new Error('tickLower must be less than tickUpper');
      }
    }
  }
}
