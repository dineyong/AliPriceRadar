import { describe, expect, it } from "vitest";
import { detectPromotionMarkers, parsePriceToken } from "../src/playwright/evidence.js";

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
});

