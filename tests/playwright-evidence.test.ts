import { describe, expect, it } from "vitest";
import {
  classifyDisplayPrice,
  classifyPageKind,
  detectPromotionMarkers,
  parsePriceToken
} from "../src/playwright/evidence.js";

describe("Playwright price evidence", () => {
  it("parses KRW and USD display tokens without choosing a tracking price", () => {
    expect(parsePriceToken("₩ 12,345")).toEqual({ raw: "₩ 12,345", currency: "KRW", amount: 12345 });
    expect(parsePriceToken("US $9.86")).toEqual({ raw: "US $9.86", currency: "USD", amount: 9.86 });
  });

  it("keeps conditional promotion signals separate", () => {
    expect(detectPromotionMarkers("Welcome Deal · New user coupon · App only · Choice")).toEqual({
      welcomeDeal: true,
      newUser: true,
      coupon: true,
      choice: true,
      appOnly: true
    });
  });

  it("treats a soft 404 as not found even when recommendations contain prices", () => {
    expect(classifyPageKind({
      hasProductPanel: false,
      bodyText: "죄송합니다. 찾으시는 페이지가 없습니다. 함께 볼 만한 상품 ₩19,616"
    })).toBe("not_found");
  });

  it("recognizes a real product panel", () => {
    expect(classifyPageKind({ hasProductPanel: true, bodyText: "상품 상세" })).toBe("product");
  });

  it("excludes new-member prices from comparable history", () => {
    expect(classifyDisplayPrice({
      pageKind: "product",
      currentPrice: parsePriceToken("₩1,657"),
      promotionText: "신규 회원 전용 혜택가"
    })).toEqual({ condition: "new_user", comparable: false });
  });

  it("accepts an unqualified main-panel display price", () => {
    expect(classifyDisplayPrice({
      pageKind: "product",
      currentPrice: parsePriceToken("₩9,560"),
      promotionText: null
    })).toEqual({ condition: "standard_display", comparable: true });
  });
});
