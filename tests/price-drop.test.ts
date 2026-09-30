import { describe, expect, it } from "vitest";
import { calculateDrop } from "../src/analysis/price-drop.js";

describe("calculateDrop", () => {
  it("calculates the amount and percentage from observed prices", () => {
    expect(calculateDrop(70, 100)).toEqual({ dropAmount: 30, dropPercent: 30 });
  });

  it("keeps increases negative instead of mislabeling them as drops", () => {
    expect(calculateDrop(120, 100)).toEqual({ dropAmount: -20, dropPercent: -20 });
  });

  it("rejects a zero baseline", () => {
    expect(() => calculateDrop(10, 0)).toThrow(/greater than zero/);
  });
});

