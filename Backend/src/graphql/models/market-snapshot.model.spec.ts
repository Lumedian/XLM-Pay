import { MarketSnapshotModel, AssetPriceModel } from './market-snapshot.model';

describe('MarketSnapshotModel', () => {
  it('should create a market snapshot with assets', () => {
    const asset: AssetPriceModel = {
      code: 'XLM',
      issuer: 'native',
      priceUSD: 0.125,
      change24h: 2.5,
      volume24h: 125000000,
      marketCap: 3500000000,
    };

    const snapshot: MarketSnapshotModel = {
      assets: [asset],
      timestamp: new Date(),
      source: 'Test Source',
      cached: false,
    };

    expect(snapshot).toBeDefined();
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets[0].code).toBe('XLM');
    expect(snapshot.assets[0].priceUSD).toBe(0.125);
  });

  it('should support multiple assets', () => {
    const assets: AssetPriceModel[] = [
      {
        code: 'XLM',
        issuer: 'native',
        priceUSD: 0.125,
        change24h: 2.5,
        volume24h: 125000000,
        marketCap: 3500000000,
      },
      {
        code: 'USDC',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        priceUSD: 1.0,
        change24h: 0.01,
        volume24h: 50000000,
        marketCap: 45000000000,
      },
    ];

    const snapshot: MarketSnapshotModel = {
      assets,
      timestamp: new Date(),
      source: 'Test Source',
      cached: true,
    };

    expect(snapshot.assets).toHaveLength(2);
    expect(snapshot.cached).toBe(true);
  });
});
