import { nanoid } from "nanoid";
import type Database from "better-sqlite3";

export interface CreateSessionResult {
  playerId: string;
  sessionToken: string;
  eloRating: number;
}

export interface SessionInfo {
  playerId: string;
  displayName: string;
  eloRating: number;
}

interface PlayerRow {
  id: string;
  display_name: string;
  elo_rating: number;
}

/**
 * Create a new anonymous player session and insert into DB.
 */
export function createAnonymousSession(
  db: Database.Database,
  displayName: string,
): CreateSessionResult {
  const playerId = nanoid(12);
  const sessionToken = nanoid(32);
  const eloRating = 1000;

  db.prepare(
    `INSERT INTO players (id, display_name, session_token, elo_rating)
     VALUES (?, ?, ?, ?)`,
  ).run(playerId, displayName, sessionToken, eloRating);

  return { playerId, sessionToken, eloRating };
}

/**
 * Validate a session token. Returns player info or null if not found.
 * Updates last_seen_at on success.
 */
export function validateSession(
  db: Database.Database,
  token: string,
): SessionInfo | null {
  const row = db
    .prepare<[string], PlayerRow>(
      `SELECT id, display_name, elo_rating FROM players WHERE session_token = ?`,
    )
    .get(token);

  if (!row) return null;

  db.prepare(`UPDATE players SET last_seen_at = datetime('now') WHERE id = ?`).run(row.id);

  return {
    playerId: row.id,
    displayName: row.display_name,
    eloRating: row.elo_rating,
  };
}

/**
 * Get or create a session. If the token is valid, return the existing player.
 * Otherwise create a new anonymous session with the given displayName.
 */
export function getOrCreateSession(
  db: Database.Database,
  token: string | null | undefined,
  displayName: string,
): SessionInfo & { sessionToken: string } {
  if (token) {
    const existing = validateSession(db, token);
    if (existing) {
      return { ...existing, sessionToken: token };
    }
  }

  const created = createAnonymousSession(db, displayName);
  return {
    playerId: created.playerId,
    displayName,
    eloRating: created.eloRating,
    sessionToken: created.sessionToken,
  };
}
