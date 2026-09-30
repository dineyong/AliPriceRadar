import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { loadDatabaseConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import {
  beginCollectionRun,
  finishCollectionRun,
  recordPriceObservation,
  selectCollectionCandidates,
  upsertProduct
} from "../db/repository.js";
import { extractPageEvidence } from "../playwright/auditor.js";

const PRICE_SCOPE = "product_display";
const limit = Number.parseInt(process.argv[2] ?? "10", 10);
if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("Collection limit must be an integer between 1 and 100.");
}

const config = loadDatabaseConfig();
const pool = createPool(config.DATABASE_URL);
const candidates = await selectCollectionCandidates(pool, {
  source: "aliexpress",
  priceScope: PRICE_SCOPE,
  limit
});
const runId = await beginCollectionRun(pool, {
  source: "aliexpress-playwright",
  country: "KR",
  currency: "KRW",
  metadata: { requestedLimit: limit, candidateCount: candidates.length, priceScope: PRICE_SCOPE }
});
const results: Array<Record<string, unknown>> = [];
let savedCount = 0;
let comparableCount = 0;
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: { "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" }
  });

  for (const candidate of candidates) {
    const page = await context.newPage();
    const observedAt = new Date();
    try {
      const response = await page.goto(candidate.productUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45_000
      });
      await page.waitForTimeout(4_000);
      const evidence = await extractPageEvidence(page);
      const displayPrice = evidence.displayedCurrentPrice;
      const isKrw = displayPrice?.currency === "KRW" && displayPrice.amount !== null;
      const comparable = evidence.priceClassification.comparable && isKrw;
      const isNewUser = evidence.priceClassification.condition === "new_user" && isKrw;

      if (evidence.title && evidence.pageKind === "product") {
        await upsertProduct(pool, {
          source: "aliexpress",
          externalProductId: candidate.externalProductId,
          title: evidence.title,
          productUrl: candidate.productUrl
        });
      }

      const rawPayload = {
        finalUrl: page.url(),
        httpStatus: response?.status() ?? null,
        title: evidence.title,
        pageKind: evidence.pageKind,
        currentPrice: displayPrice,
        originalPrice: evidence.displayedOriginalPrice,
        pricePromotionText: evidence.pricePromotionText,
        promotions: evidence.promotions,
        priceClassification: evidence.priceClassification,
        soldText: evidence.soldText,
        structuredOffers: evidence.structuredOffers,
        meta: evidence.meta
      };
      await recordPriceObservation(pool, {
        productId: candidate.productId,
        collectionRunId: runId,
        observedAt,
        source: "aliexpress-playwright",
        country: "KR",
        currency: "KRW",
        priceScope: PRICE_SCOPE,
        ...(comparable ? { salePrice: displayPrice.amount! } : {}),
        ...(isNewUser ? { newUserPrice: displayPrice.amount! } : {}),
        ...(evidence.displayedOriginalPrice?.currency === "KRW" && evidence.displayedOriginalPrice.amount !== null
          ? { originalPrice: evidence.displayedOriginalPrice.amount }
          : {}),
        availability: evidence.pageKind,
        parseConfidence: comparable ? 1 : evidence.pageKind === "product" ? 0.5 : 0,
        rawPayload
      });
      savedCount += 1;
      if (comparable) comparableCount += 1;
      results.push({
        productId: candidate.externalProductId,
        status: evidence.pageKind,
        condition: evidence.priceClassification.condition,
        comparable,
        price: displayPrice?.amount ?? null,
        currency: displayPrice?.currency ?? null,
        title: evidence.title
      });
    } catch (error) {
      results.push({
        productId: candidate.externalProductId,
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      await page.close();
    }
  }

  await context.close();
  await finishCollectionRun(pool, runId, "succeeded");
  const outputDirectory = path.resolve("reports/playwright-collection");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `collection-${runId}.json`);
  await writeFile(outputPath, JSON.stringify({ runId, generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
  console.table(results);
  console.log(`Saved ${savedCount}/${candidates.length} observations; ${comparableCount} are comparable. Report: ${outputPath}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await finishCollectionRun(pool, runId, "failed", message);
  throw error;
} finally {
  await browser?.close();
  await pool.end();
}
