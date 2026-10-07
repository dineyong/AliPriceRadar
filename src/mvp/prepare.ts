import { AliExpressAffiliateClient } from '../aliexpress/client.js';
import { projectProduct, extractAffiliateLink, productId, productUrl } from './product.js';
import { KoreanTemplateProvider, type ContentProvider } from './content.js';
import { makeDraft } from './draft.js';
export async function prepareDraft(client: AliExpressAffiliateClient, id: string, context: {
    country: string;
    currency: string;
    language: string;
}, provider: ContentProvider = new KoreanTemplateProvider()) {
    productId(id);
    const result = await client.getDetails([id], context.country, context.currency, context.language);
    const envelope = result.raw.aliexpress_affiliate_productdetail_get_response as {
        resp_result?: {
            resp_code?: unknown;
        };
    } | undefined;
    if (String(envelope?.resp_result?.resp_code) !== '200')
        throw new Error('PRODUCT_BUSINESS_ERROR');
    const product = projectProduct(result.products, id, context.currency);
    const raw = await client.call('aliexpress.affiliate.link.generate', { promotion_link_type: '0', source_values: productUrl(id), tracking_id: client.trackingId });
    const link = extractAffiliateLink(raw, productUrl(id));
    return makeDraft(product, link, await provider.generate(product, link));
}
