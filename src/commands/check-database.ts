import { loadDatabaseConfig } from "../config.js";
import { createPool } from "../db/pool.js";

const expectedTables = [
  "candidate_discoveries",
  "collection_runs",
  "price_observations",
  "products"
];
const config = loadDatabaseConfig();
const pool = createPool(config.DATABASE_URL);

try {
  const version = await pool.query<{ server_version: string }>("SHOW server_version");
  const tables = await pool.query<{ tablename: string }>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public' AND tablename = ANY($1::text[])
     ORDER BY tablename`,
    [expectedTables]
  );
  const found = tables.rows.map((row) => row.tablename);
  const missing = expectedTables.filter((table) => !found.includes(table));
  console.log({ connected: true, serverVersion: version.rows[0]?.server_version, tables: found, missing });
  if (missing.length) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error({ connected: false, error: message });
  process.exitCode = 1;
} finally {
  await pool.end();
}

