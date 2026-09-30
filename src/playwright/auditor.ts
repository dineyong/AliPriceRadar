import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { detectPromotionMarkers, parsePriceToken } from "./evidence.js";

export interface AuditProduct {
  productId: string;
  title: string;
  url: string;
  selectionSource: string;
  sourceUrl: string;
}

interface StructuredOffer {
  price?: string | number;
  lowPrice?: string | number;
  highPrice?: string | number;
  priceCurrency?: string;
  availability?: string;
}

function validateProduct(product: AuditProduct): void {
  const url = new URL(product.url);
  if (url.protocol !== "https:" || !/(^|\.)aliexpress\.com$/i.test(url.hostname)) {
    throw new Error(`Unsupported product URL for ${product.productId}`);
  }
  if (!url.pathname.includes(product.productId)) {
    throw new Error(`Product ID does not match URL for ${product.productId}`);
  }
}

export async function loadAuditProducts(filePath: string): Promise<AuditProduct[]> {
  const products = JSON.parse(await readFile(filePath, "utf8")) as AuditProduct[];
  if (!Array.isArray(products) || products.length === 0) throw new Error("Audit product list is empty.");
  products.forEach(validateProduct);
  return products;
}

export async function auditProducts(products: AuditProduct[], outputRoot: string) {
  await mkdir(outputRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: { "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" }
  });
  const results: Array<Record<string, unknown>> = [];

  try {
    for (const product of products) {
      const page = await context.newPage();
      const startedAt = new Date();
      try {
        const response = await page.goto(product.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(4_000);
        const pageData = await page.evaluate(() => {
          const bodyText = document.body?.innerText ?? "";
          const priceMatches = bodyText.match(/(?:₩|KRW\s*|US\s*\$)\s*[\d][\d,.]*/gi) ?? [];
          const structuredOffers: StructuredOffer[] = [];
          for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
              const parsed = JSON.parse(script.textContent ?? "null") as Record<string, unknown>;
              const candidates = Array.isArray(parsed) ? parsed : [parsed];
              for (const candidate of candidates) {
                const offer = (candidate as Record<string, unknown>)?.offers;
                const offers = Array.isArray(offer) ? offer : offer ? [offer] : [];
                for (const item of offers) {
                  if (item && typeof item === "object") structuredOffers.push(item as StructuredOffer);
                }
              }
            } catch {
              // Malformed third-party JSON-LD is recorded through the HTML snapshot instead.
            }
          }
          return {
            title: document.querySelector("h1")?.textContent?.trim() || document.title,
            bodyText: bodyText.slice(0, 100_000),
            priceTokens: [...new Set(priceMatches)].slice(0, 30),
            structuredOffers,
            meta: {
              ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
              ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
              productPrice: document.querySelector('meta[property="product:price:amount"]')?.getAttribute("content"),
              productCurrency: document.querySelector('meta[property="product:price:currency"]')?.getAttribute("content")
            }
          };
        });
        const htmlPath = path.join(outputRoot, `${product.productId}.html`);
        const screenshotPath = path.join(outputRoot, `${product.productId}.png`);
        await writeFile(htmlPath, await page.content(), "utf8");
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const blocked = /captcha|verify you are human|보안\s*확인|로봇이\s*아닙니다/i.test(pageData.bodyText);
        results.push({
          product,
          observedAt: startedAt.toISOString(),
          finalUrl: page.url(),
          httpStatus: response?.status() ?? null,
          title: pageData.title,
          prices: pageData.priceTokens.map(parsePriceToken),
          structuredOffers: pageData.structuredOffers,
          meta: pageData.meta,
          promotions: detectPromotionMarkers(pageData.bodyText),
          blocked,
          artifacts: { htmlPath, screenshotPath }
        });
      } catch (error) {
        results.push({
          product,
          observedAt: startedAt.toISOString(),
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const reportPath = path.join(outputRoot, "audit.json");
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
  return { reportPath, results };
}

