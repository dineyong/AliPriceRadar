export interface DiscoveredProduct {
  externalProductId: string;
  source: string;
  discoveredAt: Date;
  discoveryMethod: string;
  discoveryContext: Record<string, unknown>;
}

export interface DiscoveryProvider {
  readonly name: string;
  discover(limit: number): Promise<DiscoveredProduct[]>;
}

// A watchlist is only one PoC provider. Future providers can continuously ingest
// categories, hot products, search feeds, or AliCouponFind candidates.
export class FixedWatchlistProvider implements DiscoveryProvider {
  readonly name = "fixed-watchlist";
  constructor(private readonly productIds: string[]) {}

  async discover(limit: number): Promise<DiscoveredProduct[]> {
    return this.productIds.slice(0, limit).map((externalProductId) => ({
      externalProductId,
      source: "aliexpress",
      discoveredAt: new Date(),
      discoveryMethod: this.name,
      discoveryContext: { purpose: "collection-stability-poc" }
    }));
  }
}

