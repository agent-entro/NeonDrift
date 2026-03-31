import { Hono } from "hono";
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { RoomManager } from "../game/RoomManager.js";
import { createAnonymousSession, getOrCreateSession } from "../game/SessionManager.js";

const ADJECTIVES = ["neon", "cyber", "hyper", "turbo", "ghost", "nova", "pixel", "drift"];
const NOUNS = ["wolf", "hawk", "tiger", "storm", "fire", "blade", "comet", "rider"];
const VALID_TRACK_IDS = ["track_city_canyon", "track_orbital_loop", "track_crystal_cave"];
const DEFAULT_TRACK_ID = "track_city_canyon";

function generateSlug(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10..99
  return `${adj}-${noun}-${num}`;
}

function resolveTrackId(trackId?: string): string {
  if (trackId && VALID_TRACK_IDS.includes(trackId)) return trackId;
  return DEFAULT_TRACK_ID;
}

interface RoomRow {
  id: string;
  slug: string;
  track_id: string;
  host_player: string;
  privacy: string;
  max_players: number;
  status: string;
}

export function roomsRouter(roomManager: RoomManager, db: Database.Database): Hono {
  const app = new Hono();

  // POST /api/rooms — create a new room
  app.post("/api/rooms", async (c) => {
    let body: {
      displayName?: string;
      trackId?: string;
      privacy?: string;
      maxPlayers?: number;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    // Clamp displayName to satisfy the players table CHECK (length BETWEEN 3 AND 20)
    const rawName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const displayName = rawName.length === 0 ? "Anonymous" : rawName.slice(0, 20).padEnd(3, "_");
    const trackId = resolveTrackId(body.trackId);
    const privacy = body.privacy === "invite" ? "invite" : "public";
    const maxPlayers = Math.min(8, Math.max(2, Number(body.maxPlayers) || 8));

    // Create session
    const session = createAnonymousSession(db, displayName);

    // Generate unique slug
    let slug = generateSlug();
    let attempts = 0;
    while (attempts < 10) {
      const existing = db
        .prepare<[string], { id: string }>(`SELECT id FROM rooms WHERE slug = ?`)
        .get(slug);
      if (!existing) break;
      slug = generateSlug();
      attempts++;
    }

    // Create room in RoomManager
    const roomId = nanoid(12);
    try {
      roomManager.createRoom(roomId, trackId, session.playerId, maxPlayers);
    } catch (err) {
      return c.json({ error: "room_creation_failed", detail: String(err) }, 500);
    }

    // Insert into DB
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, "");

    try {
      db.prepare(
        `INSERT INTO rooms (id, slug, track_id, host_player, privacy, max_players, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'lobby', ?)`,
      ).run(roomId, slug, trackId, session.playerId, privacy, maxPlayers, expiresAt);
    } catch (err) {
      // Roll back in-memory room if DB insert fails
      roomManager.removeRoom(roomId);
      return c.json({ error: "db_error", detail: String(err) }, 500);
    }

    return c.json({
      slug,
      roomId,
      sessionToken: session.sessionToken,
      playerId: session.playerId,
    });
  });

  // GET /api/rooms/:slug — return room metadata
  app.get("/api/rooms/:slug", (c) => {
    const slug = c.req.param("slug");

    // Look up in DB first
    const row = db
      .prepare<[string], RoomRow>(
        `SELECT id, slug, track_id, host_player, privacy, max_players, status FROM rooms WHERE slug = ?`,
      )
      .get(slug);

    if (!row) {
      return c.json({ error: "room_not_found" }, 404);
    }

    // Get live player count from RoomManager if available
    const liveRoom = roomManager.getRoom(row.id);
    const playerCount = liveRoom ? liveRoom.getPlayerCount() : 0;

    return c.json({
      roomId: row.id,
      slug: row.slug,
      trackId: row.track_id,
      status: row.status,
      playerCount,
      maxPlayers: row.max_players,
      hostPlayerId: row.host_player,
    });
  });

  // POST /api/rooms/:slug/join
  app.post("/api/rooms/:slug/join", async (c) => {
    const slug = c.req.param("slug");

    let body: { displayName?: string; sessionToken?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const displayName = body.displayName ?? "Anonymous";
    const sessionInfo = getOrCreateSession(db, body.sessionToken, displayName);

    // Find room by slug in DB
    const row = db
      .prepare<[string], RoomRow>(
        `SELECT id, slug, track_id, host_player, privacy, max_players, status FROM rooms WHERE slug = ?`,
      )
      .get(slug);

    if (!row) {
      return c.json({ error: "room_not_found" }, 404);
    }

    if (row.status === "expired" || row.status === "finished") {
      return c.json({ error: "room_not_available", status: row.status }, 410);
    }

    return c.json({
      sessionToken: sessionInfo.sessionToken,
      playerId: sessionInfo.playerId,
      roomId: row.id,
      trackId: row.track_id,
      status: row.status,
    });
  });

  // DELETE /api/rooms/:slug/leave — noop
  app.delete("/api/rooms/:slug/leave", (c) => {
    return c.json({ ok: true });
  });

  return app;
}
