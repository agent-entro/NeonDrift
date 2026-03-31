import { Hono } from "hono";
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { RoomManager } from "../game/RoomManager.js";
import { getOrCreateSession } from "../game/SessionManager.js";
import {
  ELO_BRACKETS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  MM_BRACKET_RELAX_MS,
} from "@neondrift/shared";

const ADJECTIVES = ["neon", "cyber", "hyper", "turbo", "ghost", "nova", "pixel", "drift"];
const NOUNS = ["wolf", "hawk", "tiger", "storm", "fire", "blade", "comet", "rider"];
const DEFAULT_TRACK_IDS = ["track_city_canyon", "track_orbital_loop", "track_crystal_cave"];

function generateSlug(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${adj}-${noun}-${num}`;
}

function pickTrack(): string {
  return DEFAULT_TRACK_IDS[Math.floor(Math.random() * DEFAULT_TRACK_IDS.length)];
}

export interface QueueEntry {
  playerId: string;
  displayName: string;
  sessionToken: string;
  eloRating: number;
  region: string;
  joinedAt: number;
  ws: import("ws").WebSocket | null;
}

export interface MatchResult {
  roomId: string;
  slug: string;
  trackId: string;
  players: Array<{ playerId: string; sessionToken: string; displayName: string }>;
}

function getBracketIndex(elo: number): number {
  for (let i = 0; i < ELO_BRACKETS.length; i++) {
    const b = ELO_BRACKETS[i];
    if (elo >= b.min && elo < b.max) return i;
  }
  return ELO_BRACKETS.length - 1;
}

export class MatchmakingQueue {
  private queue: QueueEntry[] = [];
  /** Maps sessionToken -> MatchResult for matched players awaiting pickup */
  private matchResults: Map<string, MatchResult> = new Map();

  add(entry: QueueEntry): void {
    // Remove any existing entry for this player
    this.remove(entry.sessionToken);
    this.queue.push(entry);
  }

  remove(sessionToken: string): void {
    this.queue = this.queue.filter((e) => e.sessionToken !== sessionToken);
  }

  getQueuePosition(sessionToken: string): number {
    const entry = this.queue.find((e) => e.sessionToken === sessionToken);
    if (!entry) return -1;

    const bracketIdx = getBracketIndex(entry.eloRating);
    const now = Date.now();

    // Count entries in same or relaxed bracket that joined before this one
    let position = 0;
    for (const e of this.queue) {
      if (e.sessionToken === sessionToken) break;
      if (e.joinedAt >= entry.joinedAt) continue;

      const eBracket = getBracketIndex(e.eloRating);
      const relaxed = now - entry.joinedAt > MM_BRACKET_RELAX_MS;
      const inRange = relaxed
        ? Math.abs(eBracket - bracketIdx) <= 1
        : eBracket === bracketIdx;

      if (inRange) position++;
    }

    return position;
  }

  tryMatch(roomManager: RoomManager, db?: import("better-sqlite3").Database): MatchResult[] {
    const results: MatchResult[] = [];
    const now = Date.now();

    for (let bi = 0; bi < ELO_BRACKETS.length; bi++) {
      // Collect players eligible for this bracket (with relaxation)
      const eligible: QueueEntry[] = [];

      for (const entry of this.queue) {
        const entryBracket = getBracketIndex(entry.eloRating);
        const waitMs = now - entry.joinedAt;
        const relaxed = waitMs > MM_BRACKET_RELAX_MS;

        const inRange = relaxed
          ? Math.abs(entryBracket - bi) <= 1
          : entryBracket === bi;

        if (inRange) {
          eligible.push(entry);
        }
      }

      if (eligible.length < MIN_PLAYERS) continue;

      // Sort by join time to take the longest-waiting players first
      eligible.sort((a, b) => a.joinedAt - b.joinedAt);

      // Take up to MAX_PLAYERS
      const matched = eligible.slice(0, MAX_PLAYERS);

      // Generate unique slug
      let slug = generateSlug();
      let attempts = 0;
      if (db) {
        while (attempts < 10) {
          const existing = db
            .prepare<[string], { id: string }>(`SELECT id FROM rooms WHERE slug = ?`)
            .get(slug);
          if (!existing) break;
          slug = generateSlug();
          attempts++;
        }
      }

      const roomId = nanoid(12);
      const trackId = pickTrack();
      const hostPlayerId = matched[0].playerId;

      // Create in-memory room
      try {
        roomManager.createRoom(roomId, trackId, hostPlayerId, MAX_PLAYERS);
      } catch {
        continue;
      }

      // Insert into DB if available
      if (db) {
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
          .toISOString()
          .replace("T", " ")
          .replace(/\.\d{3}Z$/, "");

        try {
          db.prepare(
            `INSERT INTO rooms (id, slug, track_id, host_player, privacy, max_players, status, expires_at)
             VALUES (?, ?, ?, ?, 'public', ?, 'lobby', ?)`,
          ).run(roomId, slug, trackId, hostPlayerId, MAX_PLAYERS, expiresAt);
        } catch (err) {
          console.error("[matchmaking] DB insert failed:", err);
          roomManager.removeRoom(roomId);
          continue;
        }
      }

      const matchResult: MatchResult = {
        roomId,
        slug,
        trackId,
        players: matched.map((e) => ({
          playerId: e.playerId,
          sessionToken: e.sessionToken,
          displayName: e.displayName,
        })),
      };

      // Remove matched players from queue and store results
      for (const entry of matched) {
        this.remove(entry.sessionToken);
        this.matchResults.set(entry.sessionToken, matchResult);
      }

      results.push(matchResult);
    }

    return results;
  }

  getMatchResult(sessionToken: string): MatchResult | null {
    return this.matchResults.get(sessionToken) ?? null;
  }

  consumeMatchResult(sessionToken: string): MatchResult | null {
    const result = this.matchResults.get(sessionToken) ?? null;
    if (result) this.matchResults.delete(sessionToken);
    return result;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export function matchmakingRouter(roomManager: RoomManager, db: Database.Database): Hono {
  const app = new Hono();
  const mmQueue = new MatchmakingQueue();

  // POST /api/matchmaking/join
  app.post("/api/matchmaking/join", async (c) => {
    let body: { displayName?: string; sessionToken?: string; region?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    // Clamp displayName to satisfy the players table CHECK (length BETWEEN 3 AND 20)
    const rawName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const displayName = rawName.length === 0 ? "Anonymous" : rawName.slice(0, 20).padEnd(3, "_");
    const region = body.region ?? "global";

    const session = getOrCreateSession(db, body.sessionToken, displayName);

    const entry: QueueEntry = {
      playerId: session.playerId,
      displayName: session.displayName,
      sessionToken: session.sessionToken,
      eloRating: session.eloRating,
      region,
      joinedAt: Date.now(),
      ws: null,
    };

    mmQueue.add(entry);

    // Try to form a match
    const matchResults = mmQueue.tryMatch(roomManager, db);
    if (matchResults.length > 0) {
      console.log(
        `[matchmaking] formed ${matchResults.length} match(es), total players: ${matchResults.reduce((n, r) => n + r.players.length, 0)}`,
      );
    }

    const queuePosition = mmQueue.getQueuePosition(session.sessionToken);
    const estimatedWaitMs = queuePosition >= 0 ? (queuePosition + 1) * 5000 : 0;

    return c.json({
      queuePosition: queuePosition >= 0 ? queuePosition : 0,
      estimatedWaitMs,
      playerId: session.playerId,
      sessionToken: session.sessionToken,
    });
  });

  // DELETE /api/matchmaking — remove from queue
  app.delete("/api/matchmaking", async (c) => {
    let body: { sessionToken?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    if (body.sessionToken) {
      mmQueue.remove(body.sessionToken);
    }

    return c.json({ ok: true });
  });

  // GET /api/matchmaking/status
  app.get("/api/matchmaking/status", (c) => {
    const sessionToken = c.req.query("sessionToken");

    if (!sessionToken) {
      return c.json({ error: "sessionToken_required" }, 400);
    }

    // Check if already matched
    const matchResult = mmQueue.getMatchResult(sessionToken);
    if (matchResult) {
      return c.json({
        status: "matched",
        roomId: matchResult.roomId,
        slug: matchResult.slug,
        trackId: matchResult.trackId,
        players: matchResult.players,
        queuePosition: 0,
        estimatedWaitMs: 0,
      });
    }

    const queuePosition = mmQueue.getQueuePosition(sessionToken);
    if (queuePosition < 0) {
      return c.json({ status: "not_in_queue", queuePosition: -1, estimatedWaitMs: 0 });
    }

    return c.json({
      status: "waiting",
      queuePosition,
      estimatedWaitMs: (queuePosition + 1) * 5000,
    });
  });

  return app;
}
