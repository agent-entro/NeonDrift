/**
 * History API routes.
 * GET /api/history        — list all finished races (summary metadata)
 * GET /api/history/:id    — full race details + per-player results for a specific race
 */

import { Hono } from "hono";
import type Database from "better-sqlite3";

interface RaceRow {
  id: string;
  room_id: string;
  track_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  replay_key: string | null;
}

interface RaceResultRow {
  id: string;
  race_id: string;
  player_id: string;
  display_name: string;
  position: number;
  total_time_ms: number;
  best_lap_ms: number;
  xp_earned: number;
  powerups_used: number;
}

export function historyRouter(db: Database.Database): Hono {
  const app = new Hono();

  /**
   * GET /api/history
   * Returns a list of all finished races, newest first.
   * Each entry includes summary metadata without per-player results.
   */
  app.get("/api/history", (c) => {
    try {
      const races = db
        .prepare<[], RaceRow>(
          `SELECT id, room_id, track_id, status, started_at, finished_at, replay_key
             FROM races
            WHERE status = 'finished'
            ORDER BY finished_at DESC
            LIMIT 100`,
        )
        .all();

      // Attach winner (position=1) and player count for each race
      const summary = races.map((race) => {
        const results = db
          .prepare<[string], Pick<RaceResultRow, "player_id" | "display_name" | "position">>(
            `SELECT player_id, display_name, position
               FROM race_results
              WHERE race_id = ?
              ORDER BY position ASC`,
          )
          .all(race.id);

        const winner = results.find((r) => r.position === 1) ?? null;

        return {
          id: race.id,
          roomId: race.room_id,
          trackId: race.track_id,
          startedAt: race.started_at,
          finishedAt: race.finished_at,
          replayKey: race.replay_key,
          playerCount: results.length,
          winner: winner
            ? { playerId: winner.player_id, displayName: winner.display_name }
            : null,
        };
      });

      return c.json({ races: summary });
    } catch (err) {
      console.error("[history] GET /api/history error:", err);
      return c.json({ error: "internal_error" }, 500);
    }
  });

  /**
   * GET /api/history/:id
   * Returns full details for a single race, including all per-player results.
   */
  app.get("/api/history/:id", (c) => {
    const raceId = c.req.param("id");

    // Basic validation to prevent injection via param
    if (!raceId || !/^[a-zA-Z0-9_-]+$/.test(raceId)) {
      return c.json({ error: "invalid_race_id" }, 400);
    }

    try {
      const race = db
        .prepare<[string], RaceRow>(
          `SELECT id, room_id, track_id, status, started_at, finished_at, replay_key
             FROM races
            WHERE id = ?`,
        )
        .get(raceId);

      if (!race) {
        return c.json({ error: "race_not_found" }, 404);
      }

      const results = db
        .prepare<[string], RaceResultRow>(
          `SELECT rr.id, rr.race_id, rr.player_id, p.display_name,
                  rr.position, rr.total_time_ms, rr.best_lap_ms,
                  rr.xp_earned, rr.powerups_used
             FROM race_results rr
             LEFT JOIN players p ON p.id = rr.player_id
            WHERE rr.race_id = ?
            ORDER BY rr.position ASC`,
        )
        .all(raceId);

      return c.json({
        id: race.id,
        roomId: race.room_id,
        trackId: race.track_id,
        status: race.status,
        startedAt: race.started_at,
        finishedAt: race.finished_at,
        replayKey: race.replay_key,
        results: results.map((r) => ({
          playerId: r.player_id,
          displayName: r.display_name,
          position: r.position,
          totalTimeMs: r.total_time_ms,
          bestLapMs: r.best_lap_ms,
          xpEarned: r.xp_earned,
          powerupsUsed: r.powerups_used,
        })),
      });
    } catch (err) {
      console.error(`[history] GET /api/history/${raceId} error:`, err);
      return c.json({ error: "internal_error" }, 500);
    }
  });

  return app;
}
