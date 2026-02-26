import { ObjectType, Field, Float } from '@nestjs/graphql';

@ObjectType()
export class AssetPriceModel {
  @Field()
  code: string;

  @Field()
  issuer: string;

  @Field(() => Float)
  priceUSD: number;

  @Field(() => Float)
  change24h: number;

  @Field(() => Float)
  volume24h: number;

  @Field(() => Float)
  marketCap: number;
}

@ObjectType()
export class MarketSnapshotModel {
  @Field(() => [AssetPriceModel])
  assets: AssetPriceModel[];

  @Field()
  timestamp: Date;

  @Field()
  source: string;

  @Field({ nullable: true })
  cached?: boolean;
}
