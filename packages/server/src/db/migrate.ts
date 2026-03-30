import type Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Runs all SQL migration files in order.
 * Uses a migrations table to track what's already been applied.
 * Migrations are idempotent — safe to run multiple times.
 */
export function runMigrations(db: Database.Database, migrationsDir: string): void {
  // Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT    NOT NULL UNIQUE,
      applied_at TEXT  NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare("SELECT filename FROM _migrations").all() as { filename: string }[]).map(
      (r) => r.filename
    )
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const insertMigration = db.prepare(
    "INSERT INTO _migrations (filename) VALUES (?)"
  );

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    try {
      db.exec(sql);
      insertMigration.run(file);
      console.log(`[migrate] applied: ${file}`);
    } catch (err) {
      console.error(`[migrate] FAILED on ${file}:`, err);
      throw err;
    }
  }

  console.log("[migrate] all migrations up to date");
}
