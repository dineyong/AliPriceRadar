import { describe, expect, it } from "vitest";
import {
  canonicalProductUrl,
  cleanSearchCardTitle,
  deduplicateDiscoveredProducts,
  extractAliExpressProductId
} from "../src/discovery/aliexpress-playwright.js";
import type { DiscoveredProduct } from "../src/discovery/provider.js";

describe("AliExpress Playwright discovery", () => {
  it("extracts IDs from direct and redirected product links", () => {
    expect(extractAliExpressProductId("https://www.aliexpress.com/item/1005009956323890.html?spm=x")).toBe("1005009956323890");
    expect(extractAliExpressProductId("https://www.aliexpress.com/gcp/300000512/nn?productIds=1005011940143389")).toBe("1005011940143389");
  });

  it("ignores links without a stable product ID", () => {
    expect(extractAliExpressProductId("https://www.aliexpress.com/w/wholesale-phone-stand.html")).toBeNull();
  });

  it("normalizes canonical product URLs", () => {
    expect(canonicalProductUrl("1005009956323890")).toBe("https://www.aliexpress.com/item/1005009956323890.html");
  });

  it("keeps merchandising text out of the catalog title", () => {
    expect(cleanSearchCardTitle("휴대용 캠핑 랜턴  -55%₩5,500₩12,3354.7 3,000+ 판매")).toBe("휴대용 캠핑 랜턴");
    expect(cleanSearchCardTitle("차량용 진공 청소기 ₩19,4082 판매")).toBe("차량용 진공 청소기");
  });

  it("keeps the first occurrence when seeds overlap", () => {
    const base: DiscoveredProduct = {
      externalProductId: "1005009956323890",
      source: "aliexpress",
      discoveredAt: new Date("2026-09-30T00:00:00Z"),
      discoveryMethod: "aliexpress-search-playwright",
      discoveryContext: { seed: "phone stand", rank: 1 }
    };
    const duplicate = { ...base, discoveryContext: { seed: "desk stand", rank: 4 } };
    expect(deduplicateDiscoveredProducts([base, duplicate])).toEqual([base]);
  });
});
