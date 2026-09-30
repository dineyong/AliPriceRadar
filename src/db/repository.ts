import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export interface ProductInput {
  source: string;
  externalProductId: string;
  title?: string;
  productUrl?: string;
  affiliateUrl?: string;
  mainImageUrl?: string;
  shopId?: string;
  categoryId?: string;
  categoryName?: string;
}

export interface DiscoveryInput {
  productId: string;
  discoveryRunId?: string;
  discoveryMethod: string;
  discoveryContext: Record<string, unknown>;
  discoveredAt?: Date;
}

export interface DiscoveryRunInput {
  source: string;
  seeds: string[];
  metadata?: Record<string, unknown>;
}

export interface PriceObservationInput {
  productId: string;
  collectionRunId: string;
  observedAt?: Date;
  source: string;
  country: string;
  currency: string;
  priceScope: string;
  salePrice?: number;
  targetSalePrice?: number;
  appSalePrice?: number;
  targetAppSalePrice?: number;
  originalPrice?: number;
  targetOriginalPrice?: number;
  shippingPrice?: number;
  couponAmount?: number;
  newUserPrice?: number;
  discountPercent?: number;
  availability?: string;
  skuId?: string;
  skuSignature?: string;
  parseConfidence?: number;
  rawPayload: Record<string, unknown>;
}

export interface CollectionRunInput {
  source: string;
  country: string;
  currency: string;
  metadata?: Record<string, unknown>;
}

export interface CollectionCandidate {
  productId: string;
  externalProductId: string;
  title: string | null;
  productUrl: string;
}

type Queryable = Pick<Pool | PoolClient, "query">;

function nullable<T>(value: T | undefined): T | null {
  return value ?? null;
}

export async function beginCollectionRun(db: Queryable, input: CollectionRunInput): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO collection_runs (source, country, currency, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id::text`,
    [input.source, input.country, input.currency, JSON.stringify(input.metadata ?? {})]
  );
  return result.rows[0]!.id;
}

export async function finishCollectionRun(
  db: Queryable,
  runId: string,
  status: "succeeded" | "failed",
  errorSummary?: string
): Promise<void> {
  await db.query(
    `UPDATE collection_runs
     SET finished_at = now(), status = $2, error_summary = $3
     WHERE id = $1`,
    [runId, status, nullable(errorSummary)]
  );
}

export async function selectCollectionCandidates(
  db: Queryable,
  options: { source: string; priceScope: string; limit: number }
): Promise<CollectionCandidate[]> {
  const result = await db.query<{
    product_id: string;
    external_product_id: string;
    title: string | null;
    product_url: string;
  }>(
    `SELECT
       p.id::text AS product_id,
       p.external_product_id,
       p.title,
       p.product_url
     FROM products p
     LEFT JOIN LATERAL (
       SELECT max(po.observed_at) AS last_observed_at
       FROM price_observations po
       WHERE po.product_id = p.id AND po.price_scope = $2
     ) observations ON true
     WHERE p.source = $1
       AND p.tracking_status = 'active'
       AND p.product_url IS NOT NULL
       AND (
         observations.last_observed_at IS NULL
         OR observations.last_observed_at < date_trunc('day', now())
       )
     ORDER BY observations.last_observed_at ASC NULLS FIRST, p.last_seen_at DESC
     LIMIT $3`,
    [options.source, options.priceScope, options.limit]
  );
  return result.rows.map((row) => ({
    productId: row.product_id,
    externalProductId: row.external_product_id,
    title: row.title,
    productUrl: row.product_url
  }));
}

export async function beginDiscoveryRun(db: Queryable, input: DiscoveryRunInput): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO discovery_runs (source, seeds, metadata)
     VALUES ($1, $2::jsonb, $3::jsonb)
     RETURNING id::text`,
    [input.source, JSON.stringify(input.seeds), JSON.stringify(input.metadata ?? {})]
  );
  return result.rows[0]!.id;
}

export async function finishDiscoveryRun(
  db: Queryable,
  runId: string,
  status: "succeeded" | "failed",
  discoveredCount: number,
  errorSummary?: string
): Promise<void> {
  await db.query(
    `UPDATE discovery_runs
     SET finished_at = now(), status = $2, discovered_count = $3, error_summary = $4
     WHERE id = $1`,
    [runId, status, discoveredCount, nullable(errorSummary)]
  );
}

export async function upsertProduct(db: Queryable, input: ProductInput): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO products (
       source, external_product_id, title, product_url, affiliate_url,
       main_image_url, shop_id, category_id, category_name
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (source, external_product_id) DO UPDATE SET
       title = COALESCE(EXCLUDED.title, products.title),
       product_url = COALESCE(EXCLUDED.product_url, products.product_url),
       affiliate_url = COALESCE(EXCLUDED.affiliate_url, products.affiliate_url),
       main_image_url = COALESCE(EXCLUDED.main_image_url, products.main_image_url),
       shop_id = COALESCE(EXCLUDED.shop_id, products.shop_id),
       category_id = COALESCE(EXCLUDED.category_id, products.category_id),
       category_name = COALESCE(EXCLUDED.category_name, products.category_name),
       last_seen_at = now(),
       tracking_status = 'active'
     RETURNING id::text`,
    [
      input.source,
      input.externalProductId,
      nullable(input.title),
      nullable(input.productUrl),
      nullable(input.affiliateUrl),
      nullable(input.mainImageUrl),
      nullable(input.shopId),
      nullable(input.categoryId),
      nullable(input.categoryName)
    ]
  );
  return result.rows[0]!.id;
}

export async function recordDiscovery(db: Queryable, input: DiscoveryInput): Promise<void> {
  await db.query(
    `INSERT INTO candidate_discoveries (
       product_id, discovery_run_id, discovered_at, discovery_method, discovery_context
     ) VALUES ($1, $2, COALESCE($3, now()), $4, $5::jsonb)`,
    [
      input.productId,
      input.discoveryRunId ?? null,
      input.discoveredAt ?? null,
      input.discoveryMethod,
      JSON.stringify(input.discoveryContext)
    ]
  );
}

export async function recordPriceObservation(db: Queryable, input: PriceObservationInput): Promise<string> {
  const rawJson = JSON.stringify(input.rawPayload);
  const payloadHash = createHash("sha256").update(rawJson).digest("hex");
  const result = await db.query<{ id: string }>(
    `INSERT INTO price_observations (
       product_id, collection_run_id, observed_at, source, country, currency,
       price_scope, sale_price, target_sale_price, app_sale_price,
       target_app_sale_price, original_price, target_original_price,
       shipping_price, coupon_amount, new_user_price, discount_percent,
       availability, sku_id, sku_signature, parse_confidence,
       raw_payload, payload_hash
     ) VALUES (
       $1, $2, COALESCE($3, now()), $4, $5, $6,
       $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
       $18, $19, $20, $21, $22::jsonb, $23
     ) RETURNING id::text`,
    [
      input.productId,
      input.collectionRunId,
      input.observedAt ?? null,
      input.source,
      input.country,
      input.currency,
      input.priceScope,
      nullable(input.salePrice),
      nullable(input.targetSalePrice),
      nullable(input.appSalePrice),
      nullable(input.targetAppSalePrice),
      nullable(input.originalPrice),
      nullable(input.targetOriginalPrice),
      nullable(input.shippingPrice),
      nullable(input.couponAmount),
      nullable(input.newUserPrice),
      nullable(input.discountPercent),
      nullable(input.availability),
      nullable(input.skuId),
      nullable(input.skuSignature),
      nullable(input.parseConfidence),
      rawJson,
      payloadHash
    ]
  );
  return result.rows[0]!.id;
}
