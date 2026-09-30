export interface PriceToken {
  raw: string;
  currency: "KRW" | "USD" | "UNKNOWN";
  amount: number | null;
}

export interface PromotionMarkers {
  welcomeDeal: boolean;
  newUser: boolean;
  coupon: boolean;
  choice: boolean;
  appOnly: boolean;
}

export type PageKind = "product" | "not_found" | "blocked" | "unknown";
export type DisplayPriceCondition = "standard_display" | "new_user" | "conditional" | "unavailable";

export function parsePriceToken(raw: string): PriceToken {
  const normalized = raw.replace(/\s+/g, " ").trim();
  const currency = /₩|KRW/i.test(normalized) ? "KRW" : /US\s*\$/i.test(normalized) ? "USD" : "UNKNOWN";
  const number = normalized.match(/[\d][\d,.]*/)?.[0];
  const amount = number ? Number(number.replace(/,/g, "")) : null;
  return { raw: normalized, currency, amount: Number.isFinite(amount) ? amount : null };
}

export function detectPromotionMarkers(text: string): PromotionMarkers {
  return {
    welcomeDeal: /welcome\s*deal|웰컴\s*딜|첫\s*구매/i.test(text),
    newUser: /new\s*(user|member)|신규\s*(회원|사용자)/i.test(text),
    coupon: /coupon|쿠폰/i.test(text),
    choice: /\bchoice\b|초이스/i.test(text),
    appOnly: /app[- ]?only|app\s*exclusive|앱\s*(전용|할인)/i.test(text)
  };
}

export function classifyPageKind(input: { hasProductPanel: boolean; bodyText: string }): PageKind {
  if (/captcha|verify you are human|보안\s*확인|로봇이\s*아닙니다/i.test(input.bodyText)) return "blocked";
  if (/찾으시는\s*페이지가\s*없습니다|page\s*(is\s*)?not\s*found|item\s*(is\s*)?unavailable/i.test(input.bodyText)) {
    return "not_found";
  }
  if (input.hasProductPanel) return "product";
  return "unknown";
}

export function classifyDisplayPrice(input: {
  pageKind: PageKind;
  currentPrice: PriceToken | null;
  promotionText: string | null;
}): { condition: DisplayPriceCondition; comparable: boolean } {
  if (input.pageKind !== "product" || !input.currentPrice) {
    return { condition: "unavailable", comparable: false };
  }
  const promotion = input.promotionText ?? "";
  if (/new\s*(user|member)|신규\s*(회원|사용자)|첫\s*구매/i.test(promotion)) {
    return { condition: "new_user", comparable: false };
  }
  if (/welcome\s*deal|coupon|쿠폰|app[- ]?only|app\s*exclusive|앱\s*(전용|할인)/i.test(promotion)) {
    return { condition: "conditional", comparable: false };
  }
  return { condition: "standard_display", comparable: true };
}
