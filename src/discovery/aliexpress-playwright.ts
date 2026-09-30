import type { Page } from "playwright";
import type { DiscoveredProduct, DiscoveryProvider } from "./provider.js";

export interface SearchSeed {
  query: string;
  label?: string | undefined;
}

interface SearchCard {
  href: string;
  title: string | null;
  imageUrl: string | null;
}

export function extractAliExpressProductId(value: string): string | null {
  const decoded = decodeURIComponent(value);
  return decoded.match(/\/item\/(\d{10,})(?:\.html)?/i)?.[1]
    ?? decoded.match(/[?&]productIds?=(\d{10,})/i)?.[1]
    ?? null;
}

export function canonicalProductUrl(productId: string): string {
  return `https://www.aliexpress.com/item/${productId}.html`;
}

export function cleanSearchCardTitle(value: string): string {
  return value
    .split(/\s+(?=-\d+%|₩|US\s*\$|\$\d)/, 1)[0]!
    .trim();
}

export function deduplicateDiscoveredProducts(products: DiscoveredProduct[]): DiscoveredProduct[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.externalProductId)) return false;
    seen.add(product.externalProductId);
    return true;
  });
}

function searchUrl(query: string): string {
  return `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(query.trim().replace(/\s+/g, "-"))}.html`;
}

export class AliExpressPlaywrightDiscoveryProvider implements DiscoveryProvider {
  readonly name = "aliexpress-search-playwright";

  constructor(
    private readonly page: Page,
    private readonly seeds: SearchSeed[],
    private readonly perSeedLimit = 20
  ) {}

  async discover(limit: number): Promise<DiscoveredProduct[]> {
    const discovered: DiscoveredProduct[] = [];

    for (const seed of this.seeds) {
      if (deduplicateDiscoveredProducts(discovered).length >= limit) break;
      const url = searchUrl(seed.query);
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await this.page.waitForTimeout(2_500);

      const bodyText = (await this.page.locator("body").innerText()).slice(0, 5_000);
      if (/captcha|security verification|로봇|비정상적인 트래픽/i.test(bodyText)) {
        throw new Error(`AliExpress blocked search discovery for seed: ${seed.query}`);
      }

      const cards = await this.page.locator('a[href*="/item/"], a[href*="productIds="]').evaluateAll(
        (anchors): SearchCard[] => anchors.map((anchor) => {
          const element = anchor as HTMLAnchorElement;
          const image = element.querySelector("img");
          return {
            href: element.href,
            title: element.textContent?.trim() || image?.getAttribute("alt")?.trim() || null,
            imageUrl: image?.getAttribute("src") || image?.getAttribute("data-src") || null
          };
        })
      );

      let rank = 0;
      const seedIds = new Set<string>();
      for (const card of cards) {
        const productId = extractAliExpressProductId(card.href);
        if (!productId || seedIds.has(productId)) continue;
        seedIds.add(productId);
        rank += 1;
        const product: DiscoveredProduct = {
          externalProductId: productId,
          source: "aliexpress",
          discoveredAt: new Date(),
          discoveryMethod: this.name,
          discoveryContext: {
            seed: seed.query,
            label: seed.label ?? null,
            rank,
            searchUrl: url,
            rawCardText: card.title
          },
          productUrl: canonicalProductUrl(productId)
        };
        if (card.title) product.title = cleanSearchCardTitle(card.title);
        if (card.imageUrl) product.mainImageUrl = card.imageUrl;
        discovered.push(product);
        if (rank >= this.perSeedLimit) break;
      }
    }

    return deduplicateDiscoveredProducts(discovered).slice(0, limit);
  }
}
