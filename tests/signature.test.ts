import { describe, expect, it } from "vitest";
import { signTopRequest } from "../src/aliexpress/signature.js";

describe("signTopRequest", () => {
  it("is deterministic regardless of parameter insertion order", () => {
    const first = signTopRequest({ method: "x", app_key: "1" }, "secret");
    const second = signTopRequest({ app_key: "1", method: "x" }, "secret");
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9A-F]{32}$/);
  });
});

