import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { z } from "zod";
import { loadDatabaseConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import {
  beginDiscoveryRun,
  finishDiscoveryRun,
  recordDiscovery,
  upsertProduct
} from "../db/repository.js";
import {
  AliExpressPlaywrightDiscoveryProvider,
  type SearchSeed
} from "../discovery/aliexpress-playwright.js";

const seedsSchema = z.array(z.object({ query: z.string().min(1), label: z.string().min(1).optional() })).min(1);
const seedPath = path.resolve(process.argv[2] ?? "config/discovery-seeds.json");
const limit = Number.parseInt(process.argv[3] ?? "50", 10);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  throw new Error("Discovery limit must be an integer between 1 and 500.");
}

const seeds: SearchSeed[] = seedsSchema.parse(JSON.parse(await readFile(seedPath, "utf8")));
const config = loadDatabaseConfig();
const pool = createPool(config.DATABASE_URL);
const outputDirectory = path.resolve("reports/playwright-discovery");
const outputPath = path.join(outputDirectory, "discovery.json");
const runId = await beginDiscoveryRun(pool, {
  source: "aliexpress",
  seeds: seeds.map((seed) => seed.query),
  metadata: { provider: "aliexpress-search-playwright", requestedLimit: limit }
});
let discoveredCount = 0;
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await context.newPage();
  const provider = new AliExpressPlaywrightDiscoveryProvider(page, seeds);
  const products = await provider.discover(limit);

  for (const product of products) {
    const productId = await upsertProduct(pool, {
      source: product.source,
      externalProductId: product.externalProductId,
      ...(product.title ? { title: product.title } : {}),
      ...(product.productUrl ? { productUrl: product.productUrl } : {}),
      ...(product.mainImageUrl ? { mainImageUrl: product.mainImageUrl } : {})
    });
    await recordDiscovery(pool, {
      productId,
      discoveryRunId: runId,
      discoveryMethod: product.discoveryMethod,
      discoveryContext: product.discoveryContext,
      discoveredAt: product.discoveredAt
    });
  }

  discoveredCount = products.length;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, JSON.stringify({ runId, seeds, products }, null, 2), "utf8");
  await finishDiscoveryRun(pool, runId, "succeeded", discoveredCount);
  console.table(products.map((product) => ({
    productId: product.externalProductId,
    seed: product.discoveryContext.seed,
    rank: product.discoveryContext.rank,
    title: product.title ?? ""
  })));
  console.log(`Stored ${discoveredCount} unique candidates. Report: ${outputPath}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await finishDiscoveryRun(pool, runId, "failed", discoveredCount, message);
  throw error;
} finally {
  await browser?.close();
  await pool.end();
}
