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

