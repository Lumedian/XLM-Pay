import { Resolver, Query, Args, Subscription } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { MarketSnapshotModel, AssetPriceModel } from '../models/market-snapshot.model';
import { MarketDataService } from '../../market-data/services/market-data.service';

const pubSub = new PubSub() as any;

@Resolver(() => MarketSnapshotModel)
export class MarketDataResolver {
  constructor(
    @Inject(MarketDataService)
    private marketDataService: MarketDataService,
  ) {}

  @Query(() => MarketSnapshotModel)
  async marketSnapshot(
    @Args('assets', { type: () => [String], nullable: true }) assets?: string[],
  ): Promise<MarketSnapshotModel> {
    const data = await this.marketDataService.getMarketSnapshot(assets);

    return {
      assets: data.assets.map((asset) => ({
        code: asset.code,
        issuer: asset.issuer,
        priceUSD: asset.priceUSD,
        change24h: asset.change24h,
        volume24h: asset.volume24h,
        marketCap: asset.marketCap,
      })),
      timestamp: data.timestamp,
      source: data.source,
      cached: data.cached,
    };
  }

  @Subscription(() => MarketSnapshotModel, {
    filter: (payload, variables) => {
      if (!variables.assets || variables.assets.length === 0) {
        return true;
      }
      // Check if any of the updated assets match the subscription filter
      return payload.marketUpdated.assets.some((asset: AssetPriceModel) =>
        variables.assets.includes(asset.code),
      );
    },
  })
  marketUpdated(
    @Args('assets', { type: () => [String], nullable: true }) assets?: string[],
  ) {
    return pubSub.asyncIterator('marketUpdated');
  }

  // Helper method to publish updates (would be called from a service or scheduled job)
  async publishMarketUpdate(data: MarketSnapshotModel) {
    await pubSub.publish('marketUpdated', { marketUpdated: data });
  }
}
