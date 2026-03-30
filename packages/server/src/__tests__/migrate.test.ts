import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

describe("migration runner", () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `neondrift-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates _migrations tracking table", () => {
    runMigrations(db, tmpDir);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .get();
    expect(row).toBeTruthy();
  });

  it("applies SQL files in order", () => {
    writeFileSync(join(tmpDir, "001_create_foo.sql"), "CREATE TABLE foo (id INTEGER PRIMARY KEY);");
    writeFileSync(join(tmpDir, "002_create_bar.sql"), "CREATE TABLE bar (id INTEGER PRIMARY KEY);");

    runMigrations(db, tmpDir);

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('foo','bar')").all() as { name: string }[]
    ).map((r) => r.name);
    expect(tables).toContain("foo");
    expect(tables).toContain("bar");
  });

  it("does not re-apply already applied migrations", () => {
    writeFileSync(join(tmpDir, "001_create_foo.sql"), "CREATE TABLE foo (id INTEGER PRIMARY KEY);");

    runMigrations(db, tmpDir);
    // Should not throw on second run
    expect(() => runMigrations(db, tmpDir)).not.toThrow();
  });

  it("records applied migrations", () => {
    writeFileSync(join(tmpDir, "001_test.sql"), "CREATE TABLE test_tbl (id TEXT PRIMARY KEY);");
    runMigrations(db, tmpDir);

    const row = db.prepare("SELECT filename FROM _migrations WHERE filename = '001_test.sql'").get();
    expect(row).toBeTruthy();
  });
});
