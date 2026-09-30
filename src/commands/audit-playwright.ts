import path from "node:path";
import { auditProducts, loadAuditProducts } from "../playwright/auditor.js";

const inputPath = path.resolve(process.argv[2] ?? "config/playwright-sample-products.json");
const outputRoot = path.resolve("reports/playwright-audit");
const products = await loadAuditProducts(inputPath);

console.log(`Auditing ${products.length} public product pages with ko-KR browser context...`);
const report = await auditProducts(products, outputRoot);
console.table(
  report.results.map((result) => ({
    productId: (result.product as { productId: string }).productId,
    status: result.error ? "error" : result.blocked ? "blocked" : "observed",
    priceCandidates: Array.isArray(result.prices) ? result.prices.length : 0,
    title: result.title ?? ""
  }))
);
console.log(`Audit report: ${report.reportPath}`);

