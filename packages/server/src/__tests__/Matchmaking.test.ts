/**
 * Tests for MatchmakingQueue — ELO brackets, match formation, queue position
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import { MatchmakingQueue, type QueueEntry } from "../routes/matchmaking.js";
import { createAnonymousSession } from "../game/SessionManager.js";
import { RoomManager } from "../game/RoomManager.js";
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

/** Make a QueueEntry with a real DB player (so FK constraints are satisfied) */
function makeDbEntry(
  db: Database.Database,
  nameSuffix: string,
  eloRating: number,
  region = "us-east",
  joinedAt = Date.now(),
): QueueEntry {
  const session = createAnonymousSession(db, `Player-${nameSuffix}`);
  // Update elo to desired value
  db.prepare("UPDATE players SET elo_rating = ? WHERE id = ?").run(eloRating, session.playerId);
  return {
    playerId: session.playerId,
    displayName: `Player-${nameSuffix}`,
    sessionToken: session.sessionToken,
    eloRating,
    region,
    joinedAt,
    ws: null,
  };
}

/** Make a QueueEntry without DB (for testing pure queue logic without DB) */
function makeEntry(
  sessionToken: string,
  eloRating: number,
  region = "us-east",
  joinedAt = Date.now(),
): QueueEntry {
  return {
    playerId: `player-${sessionToken}`,
    displayName: `Player-${sessionToken}`,
    sessionToken,
    eloRating,
    region,
    joinedAt,
    ws: null,
  };
}

describe("MatchmakingQueue", () => {
  let queue: MatchmakingQueue;
  let roomManager: RoomManager;
  let db: Database.Database;

  beforeEach(() => {
    queue = new MatchmakingQueue();
    roomManager = new RoomManager();
    db = makeDb();
  });

  afterEach(() => {
    roomManager.cleanup();
    db.close();
  });

  it("adds and removes entries", () => {
    queue.add(makeEntry("tok1", 1000));
    expect(queue.getQueuePosition("tok1")).toBeGreaterThanOrEqual(0);
    queue.remove("tok1");
    expect(queue.getQueuePosition("tok1")).toBe(-1);
  });

  it("returns -1 for unknown session token", () => {
    expect(queue.getQueuePosition("unknown")).toBe(-1);
  });

  it("deduplicates — re-adding same token replaces old entry", () => {
    queue.add(makeEntry("tok1", 1000));
    queue.add(makeEntry("tok1", 1000)); // re-add
    // Should only have one entry for tok1
    expect(queue.getQueuePosition("tok1")).toBe(0); // first in bracket
  });

  it("does not match when only one player in bracket", () => {
    queue.add(makeEntry("tok1", 1000));
    const results = queue.tryMatch(roomManager, db);
    expect(results).toHaveLength(0);
    // Player still in queue
    expect(queue.getQueuePosition("tok1")).toBeGreaterThanOrEqual(0);
  });

  it("forms a match when two players are in the same bracket (no DB)", () => {
    const e1 = makeEntry("tok1", 1000);
    const e2 = makeEntry("tok2", 1100);
    queue.add(e1);
    queue.add(e2);
    // tryMatch without db skips the DB insert — match still forms in-memory
    const results = queue.tryMatch(roomManager);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].players.length).toBe(2);
    // Both players removed from queue
    expect(queue.getQueuePosition("tok1")).toBe(-1);
    expect(queue.getQueuePosition("tok2")).toBe(-1);
  });

  it("forms a match when two DB-backed players are in the same bracket", () => {
    const e1 = makeDbEntry(db, "A", 1000);
    const e2 = makeDbEntry(db, "B", 1100);
    queue.add(e1);
    queue.add(e2);
    const results = queue.tryMatch(roomManager, db);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].players.length).toBe(2);
    expect(queue.getQueuePosition(e1.sessionToken)).toBe(-1);
    expect(queue.getQueuePosition(e2.sessionToken)).toBe(-1);
  });

  it("does not match players from different brackets", () => {
    // Bracket 0: 0-800, Bracket 1: 800-1200
    queue.add(makeEntry("low", 400));   // bracket 0
    queue.add(makeEntry("mid", 1000));  // bracket 1
    const results = queue.tryMatch(roomManager);
    // Without relaxation, should not match
    expect(results).toHaveLength(0);
  });

  it("stores match result for retrieval", () => {
    const e1 = makeDbEntry(db, "C", 1000);
    const e2 = makeDbEntry(db, "D", 1100);
    queue.add(e1);
    queue.add(e2);
    queue.tryMatch(roomManager, db);
    const result = queue.getMatchResult(e1.sessionToken);
    expect(result).not.toBeNull();
    expect(result!.players.some((p) => p.sessionToken === e1.sessionToken)).toBe(true);
  });

  it("forms match with the result containing a roomId and slug", () => {
    const e1 = makeDbEntry(db, "E", 900);
    const e2 = makeDbEntry(db, "F", 950);
    queue.add(e1);
    queue.add(e2);
    const results = queue.tryMatch(roomManager, db);
    expect(results[0].roomId).toBeTruthy();
    expect(results[0].slug).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
  });

  it("caps matched players at 8 (no DB)", () => {
    // Add 10 players in same bracket
    for (let i = 0; i < 10; i++) {
      queue.add(makeEntry(`tok${i}`, 1000 + i * 5));
    }
    const results = queue.tryMatch(roomManager);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const totalMatched = results.reduce((n, r) => n + r.players.length, 0);
    expect(totalMatched).toBeLessThanOrEqual(8 * results.length);
  });
});
