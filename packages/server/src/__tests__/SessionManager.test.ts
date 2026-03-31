/**
 * Tests for SessionManager — createAnonymousSession, validateSession, getOrCreateSession
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import {
  createAnonymousSession,
  validateSession,
  getOrCreateSession,
} from "../game/SessionManager.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../migrations");

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe("createAnonymousSession", () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns a playerId, sessionToken, and eloRating=1000", () => {
    const result = createAnonymousSession(db, "TestPlayer");
    expect(result.playerId).toBeTruthy();
    expect(result.sessionToken).toBeTruthy();
    expect(result.eloRating).toBe(1000);
  });

  it("inserts a row into the players table", () => {
    const { playerId, sessionToken } = createAnonymousSession(db, "Racer42");
    const row = db
      .prepare<[string], { id: string; display_name: string; session_token: string }>(
        "SELECT id, display_name, session_token FROM players WHERE id = ?"
      )
      .get(playerId);
    expect(row).toBeTruthy();
    expect(row!.display_name).toBe("Racer42");
    expect(row!.session_token).toBe(sessionToken);
  });

  it("creates unique tokens for distinct players", () => {
    const a = createAnonymousSession(db, "Player A");
    const b = createAnonymousSession(db, "Player B");
    expect(a.sessionToken).not.toBe(b.sessionToken);
    expect(a.playerId).not.toBe(b.playerId);
  });
});

describe("validateSession", () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns null for an unknown token", () => {
    const result = validateSession(db, "not-a-real-token");
    expect(result).toBeNull();
  });

  it("returns player info for a valid token", () => {
    const { sessionToken } = createAnonymousSession(db, "Drifter");
    const info = validateSession(db, sessionToken);
    expect(info).not.toBeNull();
    expect(info!.displayName).toBe("Drifter");
    expect(info!.eloRating).toBe(1000);
  });

  it("returns the correct playerId", () => {
    const { playerId, sessionToken } = createAnonymousSession(db, "Ghost");
    const info = validateSession(db, sessionToken);
    expect(info!.playerId).toBe(playerId);
  });
});

describe("getOrCreateSession", () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("creates a new session when token is null", () => {
    const result = getOrCreateSession(db, null, "NewRacer");
    expect(result.playerId).toBeTruthy();
    expect(result.sessionToken).toBeTruthy();
    expect(result.displayName).toBe("NewRacer");
  });

  it("returns existing player when token is valid", () => {
    const { playerId, sessionToken } = createAnonymousSession(db, "OldRacer");
    const result = getOrCreateSession(db, sessionToken, "AnotherName");
    // Should return the existing player (name comes from DB, not argument)
    expect(result.playerId).toBe(playerId);
    expect(result.sessionToken).toBe(sessionToken);
  });

  it("creates a new session when token is invalid", () => {
    const result = getOrCreateSession(db, "bogus-token", "FreshRacer");
    expect(result.displayName).toBe("FreshRacer");
    // Should be a different player
    expect(result.sessionToken).not.toBe("bogus-token");
  });
});
