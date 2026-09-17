import { createHash, createHmac } from "node:crypto";

export type SignMethod = "md5" | "hmac";

export function signTopRequest(
  params: Record<string, string>,
  secret: string,
  method: SignMethod = "hmac"
): string {
  const canonical = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${value}`)
    .join("");

  if (method === "md5") {
    return createHash("md5").update(`${secret}${canonical}${secret}`, "utf8").digest("hex").toUpperCase();
  }

  return createHmac("md5", secret).update(canonical, "utf8").digest("hex").toUpperCase();
}

