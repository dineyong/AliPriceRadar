import type { ProductProjection } from "./product.js";
import { affiliateUrl } from "./product.js";
export interface ContentProvider {
    generate(product: ProductProjection, link: string): Promise<string>;
}
export class KoreanTemplateProvider implements ContentProvider {
    async generate(p: ProductProjection, link: string): Promise<string> {
        const safeTitle = p.title.replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/[\r\n]/g, " ").trim();
        if (!safeTitle)
            throw new Error("INVALID_PRODUCT_TITLE");
        const title = [...safeTitle].slice(0, 100).join("");
        const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(p.observedAt));
        const discount = p.sourceReportedDiscount ? `\nAPI 표기 할인율: ${p.sourceReportedDiscount} (기준가격·조건 미검증)` : "";
        const text = `알리 상품 가격 확인\n${title}\n\nAPI 표시가격: ${p.price} ${p.currency}${discount}\n확인: ${time} KST\n옵션·배송비·쿠폰에 따라 최종 결제금액은 달라질 수 있어요.\n\n${affiliateUrl(link)}\n\n제휴 링크입니다. 구매 시 수수료를 받을 수 있습니다.`;
        validateText(text);
        return text;
    }
}
export function validateText(text: string): void {
    if (!text.trim() || [...text].length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
        throw new Error("INVALID_THREADS_TEXT");
}
