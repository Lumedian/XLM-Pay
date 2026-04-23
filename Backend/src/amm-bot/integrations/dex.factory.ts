import { Injectable } from '@nestjs/common';
import { DexType } from '../interfaces/amm-bot.interface';
import { DexIntegration } from '../interfaces/dex-integration.interface';
import { UniswapV3Integration } from './uniswap-v3.integration';
import { CurveIntegration } from './curve.integration';
import { BalancerIntegration } from './balancer.integration';

@Injectable()
export class DexFactory {
  private integrations: Map<DexType, DexIntegration> = new Map();

  constructor(
    private readonly uniswapV3Integration: UniswapV3Integration,
    private readonly curveIntegration: CurveIntegration,
    private readonly balancerIntegration: BalancerIntegration,
  ) {
    this.initializeIntegrations();
  }

  private initializeIntegrations(): void {
    this.integrations.set(DexType.UNISWAP_V3, this.uniswapV3Integration);
    this.integrations.set(DexType.CURVE, this.curveIntegration);
    this.integrations.set(DexType.BALANCER, this.balancerIntegration);
  }

  getIntegration(dexType: DexType): DexIntegration {
    const integration = this.integrations.get(dexType);
    if (!integration) {
      throw new Error(`Unsupported DEX type: ${dexType}`);
    }
    return integration;
  }

  getAllIntegrations(): DexIntegration[] {
    return Array.from(this.integrations.values());
  }

  getSupportedDexTypes(): DexType[] {
    return Array.from(this.integrations.keys());
  }

  async initializeAll(configs: Record<DexType, any>): Promise<void> {
    const initializationPromises = Array.from(this.integrations.entries()).map(
      async ([dexType, integration]) => {
        try {
          await integration.initialize(configs[dexType]);
          console.log(`Initialized ${integration.name} integration`);
        } catch (error) {
          console.error(`Failed to initialize ${integration.name}:`, error);
        }
      }
    );

    await Promise.all(initializationPromises);
  }

  async getBestDexForPair(token0: string, token1: string): Promise<{
    dex: DexType;
    liquidity: number;
    fee: number;
    volume24h: number;
  }> {
    const results = await Promise.all(
      this.getAllIntegrations().map(async (integration) => {
        try {
          const poolData = await integration.getPoolData(token0, token1);
          return {
            dex: integration.type,
            liquidity: poolData.liquidity,
            fee: poolData.fee,
            volume24h: poolData.volume24h
          };
        } catch (error) {
          console.error(`Error fetching data from ${integration.name}:`, error);
          return null;
        }
      })
    );

    const validResults = results.filter(result => result !== null) as Array<{
      dex: DexType;
      liquidity: number;
      fee: number;
      volume24h: number;
    }>;

    if (validResults.length === 0) {
      throw new Error('No DEX found supporting this token pair');
    }

    // Score DEXes based on liquidity, volume, and fees
    const scoredResults = validResults.map(result => ({
      ...result,
      score: this.calculateDexScore(result)
    }));

    const bestDex = scoredResults.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    return bestDex;
  }

  private calculateDexScore(dexData: {
    liquidity: number;
    fee: number;
    volume24h: number;
  }): number {
    // Score calculation: higher liquidity and volume, lower fees
    const liquidityScore = Math.log(dexData.liquidity + 1) / Math.log(10000000);
    const volumeScore = Math.log(dexData.volume24h + 1) / Math.log(1000000);
    const feeScore = 1 - (dexData.fee / 10000); // Lower fees = higher score

    return (liquidityScore * 0.4) + (volumeScore * 0.4) + (feeScore * 0.2);
  }

  async compareDexes(token0: string, token1: string): Promise<Array<{
    dex: DexType;
    name: string;
    liquidity: number;
    fee: number;
    volume24h: number;
    score: number;
  }>> {
    const results = await Promise.all(
      this.getAllIntegrations().map(async (integration) => {
        try {
          const poolData = await integration.getPoolData(token0, token1);
          const score = this.calculateDexScore({
            liquidity: poolData.liquidity,
            fee: poolData.fee,
            volume24h: poolData.volume24h
          });

          return {
            dex: integration.type,
            name: integration.name,
            liquidity: poolData.liquidity,
            fee: poolData.fee,
            volume24h: poolData.volume24h,
            score
          };
        } catch (error) {
          console.error(`Error fetching data from ${integration.name}:`, error);
          return null;
        }
      })
    );

    return results.filter(result => result !== null) as Array<{
      dex: DexType;
      name: string;
      liquidity: number;
      fee: number;
      volume24h: number;
      score: number;
    }>;
  }
}
