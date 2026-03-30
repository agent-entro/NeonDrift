import Database from "better-sqlite3";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return _db;
}

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  // WAL mode for concurrent reads
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  _db = db;
  return db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
