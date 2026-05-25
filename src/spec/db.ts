import { readFileSync } from "node:fs";
import initSqlJs, { type Database } from "sql.js";
import { resolveDataPath } from "../config.js";

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dbPath = resolveDataPath("index.db");
  const buffer = readFileSync(dbPath);
  db = new SQL.Database(buffer);
  return db;
}
