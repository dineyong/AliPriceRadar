import "dotenv/config";
import { z } from "zod";

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const affiliateSchema = z.object({
  ALIEXPRESS_APP_KEY: z.string().min(1),
  ALIEXPRESS_APP_SECRET: z.string().min(1),
  ALIEXPRESS_TRACKING_ID: z.string().min(1),
  ALIEXPRESS_API_URL: z.url().default("https://eco.taobao.com/router/rest"),
  ALIEXPRESS_COUNTRY: z.string().length(2).default("KR"),
  ALIEXPRESS_CURRENCY: z.string().length(3).default("KRW"),
  ALIEXPRESS_LANGUAGE: z.string().min(2).default("KO"),
  ALIEXPRESS_PROBE_KEYWORD: z.string().min(1).default("phone stand")
});

export type Config = z.infer<typeof databaseSchema> & z.infer<typeof affiliateSchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, label: string): T {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid ${label} environment variables: ${missing}`);
  }
  return result.data;
}

export function loadDatabaseConfig() {
  return parseOrThrow(databaseSchema, "database");
}

export function loadAffiliateConfig() {
  return parseOrThrow(affiliateSchema, "Affiliate API");
}

export function loadConfig(): Config {
  return { ...loadDatabaseConfig(), ...loadAffiliateConfig() };
}
