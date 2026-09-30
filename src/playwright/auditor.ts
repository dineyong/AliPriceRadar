import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { classifyDisplayPrice, classifyPageKind, detectPromotionMarkers, parsePriceToken } from "./evidence.js";

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

export async function extractPageEvidence(page: Page) {
  const pageData = await page.evaluate(() => {
    const bodyText = document.body?.innerText ?? "";
    const productPanel = document.querySelector(".pdp-info-right");
    const mainText = (productPanel as HTMLElement | null)?.innerText ?? "";
    const allPagePriceTokens = [
      ...new Set(bodyText.match(/(?:₩|KRW\s*|US\s*\$)\s*[\d][\d,.]*/gi) ?? [])
    ].slice(0, 30);
    const mainPriceTokens = [
      ...new Set(mainText.match(/(?:₩|KRW\s*|US\s*\$)\s*[\d][\d,.]*/gi) ?? [])
    ].slice(0, 30);
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
        // Malformed third-party JSON-LD remains available in the HTML snapshot.
      }
    }
    return {
      hasProductPanel: Boolean(productPanel),
      title: productPanel?.querySelector('[data-pl="product-title"]')?.textContent?.trim()
        || document.querySelector("h1")?.textContent?.trim()
        || document.title,
      bodyText: bodyText.slice(0, 100_000),
      mainText: mainText.slice(0, 20_000),
      allPagePriceTokens,
      mainPriceTokens,
      displayedCurrentPrice: (productPanel?.querySelector('[class*="price-kr--current--"]') as HTMLElement | null)?.innerText?.trim() || null,
      displayedOriginalPrice: (productPanel?.querySelector('[class*="price-kr--originWrap--"]') as HTMLElement | null)?.innerText?.trim() || null,
      pricePromotionText: (productPanel?.querySelector('[class*="pricePromotionInfo"]') as HTMLElement | null)?.innerText?.trim() || null,
      soldText: (productPanel?.querySelector('[class*="reviewer--sold"]') as HTMLElement | null)?.innerText?.trim() || null,
      structuredOffers,
      meta: {
        ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
        ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
        productPrice: document.querySelector('meta[property="product:price:amount"]')?.getAttribute("content"),
        productCurrency: document.querySelector('meta[property="product:price:currency"]')?.getAttribute("content")
      }
    };
  });

  const pageKind = classifyPageKind(pageData);
  const displayedCurrentPrice = pageData.displayedCurrentPrice ? parsePriceToken(pageData.displayedCurrentPrice) : null;
  return {
    ...pageData,
    pageKind,
    allPagePrices: pageData.allPagePriceTokens.map(parsePriceToken),
    mainPrices: pageData.mainPriceTokens.map(parsePriceToken),
    displayedCurrentPrice,
    displayedOriginalPrice: pageData.displayedOriginalPrice ? parsePriceToken(pageData.displayedOriginalPrice) : null,
    promotions: detectPromotionMarkers(pageData.mainText),
    priceClassification: classifyDisplayPrice({
      pageKind,
      currentPrice: displayedCurrentPrice,
      promotionText: pageData.pricePromotionText
    })
  };
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
        const pageData = await extractPageEvidence(page);
        const htmlPath = path.join(outputRoot, `${product.productId}.html`);
        const screenshotPath = path.join(outputRoot, `${product.productId}.png`);
        await writeFile(htmlPath, await page.content(), "utf8");
        await page.screenshot({ path: screenshotPath, fullPage: true });
        results.push({
          product,
          observedAt: startedAt.toISOString(),
          finalUrl: page.url(),
          httpStatus: response?.status() ?? null,
          title: pageData.title,
          pageKind: pageData.pageKind,
          mainProduct: {
            currentPrice: pageData.displayedCurrentPrice,
            originalPrice: pageData.displayedOriginalPrice,
            priceCandidates: pageData.mainPrices,
            pricePromotionText: pageData.pricePromotionText,
            soldText: pageData.soldText,
            promotions: pageData.promotions,
            priceClassification: pageData.priceClassification
          },
          allPagePrices: pageData.allPagePrices,
          structuredOffers: pageData.structuredOffers,
          meta: pageData.meta,
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
