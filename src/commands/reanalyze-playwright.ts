import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { extractPageEvidence, loadAuditProducts } from "../playwright/auditor.js";

const inputPath = path.resolve(process.argv[2] ?? "config/playwright-sample-products.json");
const outputRoot = path.resolve("reports/playwright-audit");
const products = await loadAuditProducts(inputPath);
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const product of products) {
    const page = await browser.newPage({ locale: "ko-KR" });
    try {
      const html = await readFile(path.join(outputRoot, `${product.productId}.html`), "utf8");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const evidence = await extractPageEvidence(page);
      results.push({
        productId: product.productId,
        pageKind: evidence.pageKind,
        title: evidence.title,
        currentPrice: evidence.displayedCurrentPrice,
        originalPrice: evidence.displayedOriginalPrice,
        pricePromotionText: evidence.pricePromotionText,
        soldText: evidence.soldText,
        mainPriceCandidates: evidence.mainPrices,
        promotions: evidence.promotions,
        priceClassification: evidence.priceClassification,
        structuredOffers: evidence.structuredOffers
      });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const reportPath = path.join(outputRoot, "reanalysis.json");
await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
console.table(results.map((result) => ({
  productId: result.productId,
  pageKind: result.pageKind,
  currentPrice: result.currentPrice?.raw ?? "",
  promotion: result.pricePromotionText ?? "",
  comparable: result.priceClassification.comparable
})));
console.log(`Reanalysis report: ${reportPath}`);
