import type { AffiliateProduct } from "../aliexpress/client.js";
export interface ProductProjection {
    productId: string;
    title: string;
    productUrl: string;
    price: string;
    currency: string;
    sourceReportedDiscount: string | null;
    observedAt: string;
    priceScope: "AFFILIATE_API_LISTED_PRICE";
}
export function productId(value: string): string {
    if (!/^\d{5,20}$/.test(value))
        throw new Error("INVALID_PRODUCT_ID");
    return value;
}
export function productUrl(id: string): string { return `https://www.aliexpress.com/item/${productId(id)}.html`; }
export function projectProduct(products: AffiliateProduct[], id: string, currency: string, now = new Date()): ProductProjection {
    productId(id);
    const matches = products.filter(p => String(p.product_id) === id);
    if (matches.length !== 1)
        throw new Error("PRODUCT_NOT_UNAMBIGUOUS");
    const p = matches[0]!;
    const title = typeof p.product_title === "string" ? p.product_title.trim() : "";
    if (!title || title.length > 1000 || /[\x00-\x1f]/.test(title))
        throw new Error("INVALID_PRODUCT_TITLE");
    // Never substitute app/new-user/original price or mix a price with another currency field.
    const pair = p.target_sale_price != null
        ? [p.target_sale_price, p.target_sale_price_currency]
        : [p.sale_price, p.sale_price_currency];
    if (typeof pair[0] !== "string" || !/^\d+(\.\d{1,8})?$/.test(pair[0]) || !Number.isFinite(Number(pair[0])) || Number(pair[0]) <= 0 || pair[1] !== currency)
        throw new Error("INVALID_OR_MISMATCHED_PRICE");
    return { productId: id, title, productUrl: productUrl(id), price: pair[0], currency,
        sourceReportedDiscount: typeof p.discount === "string" && /^(?:[1-9]|[1-9][0-9])%$/.test(p.discount) ? p.discount : null,
        observedAt: now.toISOString(), priceScope: "AFFILIATE_API_LISTED_PRICE" };
}
export function affiliateUrl(value: unknown): string {
    if (typeof value !== "string")
        throw new Error("INVALID_AFFILIATE_URL");
    let url: URL;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error("INVALID_AFFILIATE_URL");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "s.click.aliexpress.com" || url.username || url.password || url.port || !/^\/e\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) || url.search || url.hash)
        throw new Error("INVALID_AFFILIATE_URL");
    // Preserve the API-returned scheme; upgrading it would be an unverified rewrite.
    return url.href;
}
export function extractAffiliateLink(raw: Record<string, unknown>, source: string): string {
    const envelope = raw.aliexpress_affiliate_link_generate_response as {
        resp_result?: {
            resp_code?: unknown;
            result?: {
                promotion_links?: {
                    promotion_link?: unknown;
                };
            };
        };
    } | undefined;
    if (String(envelope?.resp_result?.resp_code) !== "200")
        throw new Error("AFFILIATE_LINK_BUSINESS_ERROR");
    const rows = envelope?.resp_result?.result?.promotion_links?.promotion_link;
    const links = Array.isArray(rows) ? rows : rows && typeof rows === "object" ? [rows] : [];
    const matching = links.filter(r => r && typeof r === "object" && r.source_value === source);
    if (matching.length !== 1)
        throw new Error("AFFILIATE_LINK_SOURCE_MISMATCH");
    return affiliateUrl(matching[0].promotion_link);
}
