import type { Pool } from "pg";

export const comparablePriceFields = [
  "sale_price",
  "target_sale_price",
  "app_sale_price",
  "target_app_sale_price"
] as const;

export type ComparablePriceField = (typeof comparablePriceFields)[number];

export interface PriceDrop {
  productId: string;
  externalProductId: string;
  title: string | null;
  currentPrice: number;
  baselinePrice: number;
  dropAmount: number;
  dropPercent: number;
  currentObservedAt: Date;
  baselineObservedAt: Date;
}

export function calculateDrop(currentPrice: number, baselinePrice: number) {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(baselinePrice) || baselinePrice <= 0) {
    throw new Error("Prices must be finite and baselinePrice must be greater than zero.");
  }
  const dropAmount = baselinePrice - currentPrice;
  return { dropAmount, dropPercent: (dropAmount / baselinePrice) * 100 };
}

export async function findSevenDayPriceDrops(
  pool: Pool,
  field: ComparablePriceField,
  options: { country: string; currency: string; limit?: number; toleranceHours?: number }
): Promise<PriceDrop[]> {
  if (!comparablePriceFields.includes(field)) throw new Error(`Unsupported price field: ${field}`);
  const limit = options.limit ?? 20;
  const toleranceHours = options.toleranceHours ?? 36;
  const result = await pool.query<{
    product_id: string;
    external_product_id: string;
    title: string | null;
    current_price: string;
    baseline_price: string;
    current_observed_at: Date;
    baseline_observed_at: Date;
  }>(
    `WITH latest AS (
       SELECT DISTINCT ON (po.product_id, po.price_scope)
         po.product_id, po.price_scope, po.observed_at, po.${field} AS price
       FROM price_observations po
       WHERE po.country = $1 AND po.currency = $2 AND po.${field} IS NOT NULL
       ORDER BY po.product_id, po.price_scope, po.observed_at DESC
     )
     SELECT
       p.id::text AS product_id,
       p.external_product_id,
       p.title,
       latest.price::text AS current_price,
       baseline.price::text AS baseline_price,
       latest.observed_at AS current_observed_at,
       baseline.observed_at AS baseline_observed_at
     FROM latest
     JOIN products p ON p.id = latest.product_id
     JOIN LATERAL (
       SELECT po.${field} AS price, po.observed_at
       FROM price_observations po
       WHERE po.product_id = latest.product_id
         AND po.price_scope = latest.price_scope
         AND po.country = $1
         AND po.currency = $2
         AND po.${field} IS NOT NULL
         AND po.observed_at BETWEEN
           latest.observed_at - interval '7 days' - ($3 * interval '1 hour')
           AND latest.observed_at - interval '7 days' + ($3 * interval '1 hour')
       ORDER BY abs(extract(epoch FROM (po.observed_at - (latest.observed_at - interval '7 days'))))
       LIMIT 1
     ) baseline ON true
     WHERE latest.price < baseline.price
     ORDER BY ((baseline.price - latest.price) / baseline.price) DESC
     LIMIT $4`,
    [options.country, options.currency, toleranceHours, limit]
  );

  return result.rows.map((row) => {
    const currentPrice = Number(row.current_price);
    const baselinePrice = Number(row.baseline_price);
    return {
      productId: row.product_id,
      externalProductId: row.external_product_id,
      title: row.title,
      currentPrice,
      baselinePrice,
      ...calculateDrop(currentPrice, baselinePrice),
      currentObservedAt: row.current_observed_at,
      baselineObservedAt: row.baseline_observed_at
    };
  });
}

