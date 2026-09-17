import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDatabaseConfig } from "../config.js";
import { createPool } from "../db/pool.js";

const config = loadDatabaseConfig();
const pool = createPool(config.DATABASE_URL);

try {
  const schemaPath = fileURLToPath(new URL("../db/schema.sql", import.meta.url));
  await pool.query(await readFile(schemaPath, "utf8"));
  console.log("PostgreSQL schema is ready.");
} finally {
  await pool.end();
}
