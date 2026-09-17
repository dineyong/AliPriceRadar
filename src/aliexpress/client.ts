import { signTopRequest } from "./signature.js";

export interface AliExpressClientOptions {
  apiUrl: string;
  appKey: string;
  appSecret: string;
  trackingId: string;
}

export interface AffiliateProduct {
  product_id?: number | string;
  product_title?: string;
  product_detail_url?: string;
  product_main_image_url?: string;
  sale_price?: string;
  sale_price_currency?: string;
  target_sale_price?: string;
  target_sale_price_currency?: string;
  app_sale_price?: string;
  app_sale_price_currency?: string;
  target_app_sale_price?: string;
  target_app_sale_price_currency?: string;
  original_price?: string;
  original_price_currency?: string;
  target_original_price?: string;
  target_original_price_currency?: string;
  discount?: string;
  evaluate_rate?: string;
  lastest_volume?: number;
  first_level_category_id?: number;
  first_level_category_name?: string;
  second_level_category_id?: number;
  second_level_category_name?: string;
  shop_id?: number;
  [key: string]: unknown;
}

type ApiEnvelope = Record<string, unknown>;

function timestampInGmt8(date = new Date()): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace("T", " ").slice(0, 19);
}

function findProducts(value: unknown): AffiliateProduct[] {
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const direct = object.products;
  if (direct && typeof direct === "object") {
    const product = (direct as Record<string, unknown>).product;
    if (Array.isArray(product)) return product as AffiliateProduct[];
    if (product && typeof product === "object") return [product as AffiliateProduct];
  }
  for (const child of Object.values(object)) {
    const found = findProducts(child);
    if (found.length) return found;
  }
  return [];
}

export class AliExpressAffiliateClient {
  constructor(private readonly options: AliExpressClientOptions) {}

  async call(method: string, businessParams: Record<string, string>): Promise<ApiEnvelope> {
    const params: Record<string, string> = {
      app_key: this.options.appKey,
      format: "json",
      method,
      partner_id: "aliprice-radar",
      sign_method: "hmac",
      simplify: "false",
      timestamp: timestampInGmt8(),
      v: "2.0",
      ...businessParams
    };
    params.sign = signTopRequest(params, this.options.appSecret, "hmac");

    const response = await fetch(this.options.apiUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(30_000)
    });
    const body = (await response.json()) as ApiEnvelope;
    if (!response.ok || "error_response" in body) {
      throw new Error(`AliExpress API error (${response.status}): ${JSON.stringify(body)}`);
    }
    return body;
  }

  async testAuthentication(): Promise<ApiEnvelope> {
    return this.call("aliexpress.affiliate.category.get", {
      app_signature: "aliprice-radar"
    });
  }

  async searchFive(keyword: string, country: string, currency: string, language: string) {
    const raw = await this.call("aliexpress.affiliate.product.query", {
      app_signature: "aliprice-radar",
      fields: [
        "product_id", "product_title", "product_detail_url", "product_main_image_url",
        "sale_price", "sale_price_currency", "target_sale_price", "target_sale_price_currency",
        "app_sale_price", "app_sale_price_currency", "target_app_sale_price",
        "target_app_sale_price_currency", "original_price", "original_price_currency",
        "target_original_price", "target_original_price_currency", "discount", "evaluate_rate",
        "lastest_volume", "first_level_category_id", "first_level_category_name",
        "second_level_category_id", "second_level_category_name", "shop_id"
      ].join(","),
      keywords: keyword,
      page_no: "1",
      page_size: "5",
      ship_to_country: country,
      target_currency: currency,
      target_language: language,
      tracking_id: this.options.trackingId
    });
    return { raw, products: findProducts(raw).slice(0, 5) };
  }

  async getDetails(productIds: string[], country: string, currency: string, language: string) {
    const raw = await this.call("aliexpress.affiliate.productdetail.get", {
      app_signature: "aliprice-radar",
      country,
      fields: [
        "product_id", "product_title", "product_detail_url", "product_main_image_url",
        "sale_price", "sale_price_currency", "target_sale_price", "target_sale_price_currency",
        "app_sale_price", "app_sale_price_currency", "target_app_sale_price",
        "target_app_sale_price_currency", "original_price", "original_price_currency",
        "target_original_price", "target_original_price_currency", "discount", "evaluate_rate",
        "lastest_volume", "first_level_category_id", "first_level_category_name",
        "second_level_category_id", "second_level_category_name", "shop_id"
      ].join(","),
      product_ids: productIds.join(","),
      target_currency: currency,
      target_language: language,
      tracking_id: this.options.trackingId
    });
    return { raw, products: findProducts(raw) };
  }
}

