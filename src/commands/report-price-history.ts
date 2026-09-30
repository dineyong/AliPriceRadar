import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findSevenDayPriceDrops } from "../analysis/price-drop.js";
import { loadDatabaseConfig } from "../config.js";
import { createPool } from "../db/pool.js";

const config = loadDatabaseConfig();
const pool = createPool(config.DATABASE_URL);

try {
  const coverage = await pool.query<{
    observed_day: string;
    total_count: string;
    comparable_count: string;
    new_user_count: string;
  }>(
    `SELECT
       to_char(observed_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS observed_day,
       count(*)::text AS total_count,
       count(*) FILTER (WHERE sale_price IS NOT NULL)::text AS comparable_count,
       count(*) FILTER (WHERE new_user_price IS NOT NULL)::text AS new_user_count
     FROM price_observations
     WHERE source = 'aliexpress-playwright' AND price_scope = 'product_display'
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 14`
  );
  const summary = await pool.query<{
    tracked_products: string;
    comparable_products: string;
    first_observed_at: Date | null;
    last_observed_at: Date | null;
  }>(
    `SELECT
       count(DISTINCT product_id)::text AS tracked_products,
       count(DISTINCT product_id) FILTER (WHERE sale_price IS NOT NULL)::text AS comparable_products,
       min(observed_at) AS first_observed_at,
       max(observed_at) AS last_observed_at
     FROM price_observations
     WHERE source = 'aliexpress-playwright' AND price_scope = 'product_display'`
  );
  const drops = await findSevenDayPriceDrops(pool, "sale_price", {
    country: "KR",
    currency: "KRW",
    limit: 20,
    toleranceHours: 36
  });
  const report = {
    generatedAt: new Date().toISOString(),
    market: { country: "KR", currency: "KRW", priceScope: "product_display" },
    summary: summary.rows[0],
    dailyCoverage: coverage.rows,
    sevenDayDrops: drops
  };
  const outputDirectory = path.resolve("reports/price-history");
  const outputPath = path.join(outputDirectory, "latest.json");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Price history summary:", report.summary);
  console.table(coverage.rows.map((row) => ({
    day: row.observed_day,
    observations: row.total_count,
    comparable: row.comparable_count,
    newUser: row.new_user_count
  })));
  if (drops.length === 0) {
    console.log("No seven-day price drops yet. Daily observations need time to accumulate.");
  } else {
    console.table(drops.map((drop) => ({
      productId: drop.externalProductId,
      title: drop.title ?? "",
      currentPrice: drop.currentPrice,
      baselinePrice: drop.baselinePrice,
      dropPercent: `${drop.dropPercent.toFixed(2)}%`
    })));
  }
  console.log(`History report: ${outputPath}`);
} finally {
  await pool.end();
}
