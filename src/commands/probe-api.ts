import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadAffiliateConfig } from "../config.js";
import { AliExpressAffiliateClient, type AffiliateProduct } from "../aliexpress/client.js";

const priceFields = [
  "sale_price", "sale_price_currency", "target_sale_price", "target_sale_price_currency",
  "app_sale_price", "app_sale_price_currency", "target_app_sale_price",
  "target_app_sale_price_currency", "original_price", "original_price_currency",
  "target_original_price", "target_original_price_currency", "discount"
] as const;

function priceView(product: AffiliateProduct) {
  return Object.fromEntries(
    ["product_id", "product_title", ...priceFields]
      .filter((key) => product[key] !== undefined)
      .map((key) => [key, product[key]])
  );
}

const config = loadAffiliateConfig();
const client = new AliExpressAffiliateClient({
  apiUrl: config.ALIEXPRESS_API_URL,
  appKey: config.ALIEXPRESS_APP_KEY,
  appSecret: config.ALIEXPRESS_APP_SECRET,
  trackingId: config.ALIEXPRESS_TRACKING_ID
});

console.log("1/3 Testing Affiliate API authentication...");
await client.testAuthentication();
console.log("Authentication succeeded.");

console.log(`2/3 Searching five products for KR/KRW with keyword: ${config.ALIEXPRESS_PROBE_KEYWORD}`);
const search = await client.searchFive(
  config.ALIEXPRESS_PROBE_KEYWORD,
  config.ALIEXPRESS_COUNTRY,
  config.ALIEXPRESS_CURRENCY,
  config.ALIEXPRESS_LANGUAGE
);
const ids = search.products.map((product) => String(product.product_id)).filter(Boolean);
if (ids.length !== 5) throw new Error(`Expected 5 products, received ${ids.length}.`);

console.log("3/3 Requesting detail records for the same five product IDs...");
const details = await client.getDetails(
  ids,
  config.ALIEXPRESS_COUNTRY,
  config.ALIEXPRESS_CURRENCY,
  config.ALIEXPRESS_LANGUAGE
);

const report = {
  collectedAt: new Date().toISOString(),
  requestContext: {
    country: config.ALIEXPRESS_COUNTRY,
    currency: config.ALIEXPRESS_CURRENCY,
    language: config.ALIEXPRESS_LANGUAGE,
    keyword: config.ALIEXPRESS_PROBE_KEYWORD
  },
  searchPriceFields: search.products.map(priceView),
  detailPriceFields: details.products.map(priceView),
  raw: { search: search.raw, details: details.raw },
  rawPayloadSha256: createHash("sha256")
    .update(JSON.stringify({ search: search.raw, details: details.raw }))
    .digest("hex")
};

await mkdir("reports", { recursive: true });
await writeFile("reports/api-probe.json", JSON.stringify(report, null, 2), "utf8");
console.table(report.detailPriceFields);
console.log("Full raw response saved locally to reports/api-probe.json (Git ignored). No tracking price was selected.");
