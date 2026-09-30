import { findSevenDayPriceDrops } from "../analysis/price-drop.js";
import { loadDatabaseConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import {
  beginCollectionRun,
  finishCollectionRun,
  recordDiscovery,
  recordPriceObservation,
  upsertProduct
} from "../db/repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const baselinePrice = 100_000;
const currentPrices = [25_000, 50_000, 80_000, 100_000, 110_000];
const config = loadDatabaseConfig();
const pool = createPool(config.DATABASE_URL);
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const now = new Date();
  const marker = `smoke-${now.getTime()}`;
  const runId = await beginCollectionRun(client, {
    source: "synthetic-smoke-test",
    country: "KR",
    currency: "KRW",
    metadata: { temporary: true, marker }
  });

  for (const [index, currentPrice] of currentPrices.entries()) {
    const externalProductId = `${marker}-${index + 1}`;
    const productId = await upsertProduct(client, {
      source: "synthetic-smoke-test",
      externalProductId,
      title: `Temporary smoke product ${index + 1}`
    });
    await recordDiscovery(client, {
      productId,
      discoveryMethod: "synthetic-smoke-test",
      discoveryContext: { temporary: true }
    });

    for (let daysAgo = 7; daysAgo >= 0; daysAgo -= 1) {
      const progress = (7 - daysAgo) / 7;
      const price = Math.round(baselinePrice + (currentPrice - baselinePrice) * progress);
      await recordPriceObservation(client, {
        productId,
        collectionRunId: runId,
        observedAt: new Date(now.getTime() - daysAgo * DAY_MS),
        source: "synthetic-smoke-test",
        country: "KR",
        currency: "KRW",
        priceScope: "synthetic-comparable-price",
        targetSalePrice: price,
        availability: "available",
        parseConfidence: 1,
        rawPayload: { temporary: true, externalProductId, target_sale_price: price }
      });
    }
  }

  await finishCollectionRun(client, runId, "succeeded");
  const drops = await findSevenDayPriceDrops(client, "target_sale_price", {
    country: "KR",
    currency: "KRW",
    limit: 20,
    toleranceHours: 1
  });
  const smokeDrops = drops.filter((drop) => drop.externalProductId.startsWith(marker));

  if (smokeDrops.length !== 3) {
    throw new Error(`Expected 3 falling products, received ${smokeDrops.length}.`);
  }
  const actualPercents = smokeDrops.map((drop) => Math.round(drop.dropPercent));
  const expectedPercents = [75, 50, 20];
  if (JSON.stringify(actualPercents) !== JSON.stringify(expectedPercents)) {
    throw new Error(`Unexpected ranking: ${actualPercents.join(", ")}`);
  }

  console.table(
    smokeDrops.map((drop, index) => ({
      rank: index + 1,
      product: drop.externalProductId,
      sevenDaysAgo: drop.baselinePrice,
      current: drop.currentPrice,
      dropPercent: Number(drop.dropPercent.toFixed(2))
    }))
  );
  console.log("Smoke test passed. The transaction will now be rolled back.");
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}

