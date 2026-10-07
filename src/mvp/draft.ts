import { createHash } from "node:crypto";
import { z } from "zod";
import { productId, productUrl, affiliateUrl, type ProductProjection } from "./product.js";
import { validateText } from "./content.js";
export const draftSchema = z.object({
    version: z.literal(1), origin: z.enum(["LIVE_API", "FIXTURE"]), status: z.literal("DRAFT"), product: z.object({
        productId: z.string(), title: z.string().min(1).max(1000), productUrl: z.string(), price: z.string(), currency: z.string().regex(/^[A-Z]{3}$/),
        sourceReportedDiscount: z.string().regex(/^(?:[1-9]|[1-9][0-9])%$/).nullable(), observedAt: z.iso.datetime(), priceScope: z.literal("AFFILIATE_API_LISTED_PRICE")
    }).strict(), affiliateUrl: z.string(), text: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
export type Draft = z.infer<typeof draftSchema>;
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function makeDraft(product: ProductProjection, link: string, text: string, origin: "LIVE_API" | "FIXTURE" = "LIVE_API"): Draft {
    return readDraft({ version: 1, origin, status: "DRAFT", product, affiliateUrl: link, text, contentHash: hash(text) });
}
export function readDraft(value: unknown): Draft {
    const d = draftSchema.parse(value);
    productId(d.product.productId);
    affiliateUrl(d.affiliateUrl);
    validateText(d.text);
    if (d.product.productUrl !== productUrl(d.product.productId) || !/^\d+(\.\d{1,8})?$/.test(d.product.price) || !Number.isFinite(Number(d.product.price)) || Number(d.product.price) <= 0 || hash(d.text) !== d.contentHash || !d.text.includes(d.affiliateUrl) || !d.text.includes("제휴 링크") || !d.text.includes(`${d.product.price} ${d.product.currency}`))
        throw new Error("INVALID_DRAFT");
    return d;
}
