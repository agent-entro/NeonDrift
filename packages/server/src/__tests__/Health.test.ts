/**
 * Tests for /api/health endpoint and room creation hardening.
 * Validates that the DB health check returns correct structure
 * and that short display names don't cause DB constraint violations.
 */
import { describe, it, expect, afterAll } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Database from "better-sqlite3";
import { Hono } from "hono";
import { runMigrations } from "../db/migrate.js";
import { RoomManager } from "../game/RoomManager.js";
import { roomsRouter } from "../routes/rooms.js";
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

/** Bridge helper used in HttpBridge.test.ts — replicated here for test isolation. */
function buildServer(app: Hono): ReturnType<typeof createServer> {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = `http://localhost${req.url ?? "/"}`;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
      const flatHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined) flatHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
      }
      const honoReq = new Request(url, {
        method: req.method ?? "GET",
        headers: flatHeaders,
        body: body?.length ? body : undefined,
        ...(body?.length ? { duplex: "half" } as Record<string, unknown> : {}),
      });
      const honoRes = await app.fetch(honoReq);
      const resBody = await honoRes.arrayBuffer();
      res.writeHead(honoRes.status, Object.fromEntries(honoRes.headers.entries()));
      res.end(Buffer.from(resBody));
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "internal_server_error" }));
    }
  });
}

async function request(
  port: number,
  opts: { method?: string; path?: string; body?: unknown },
): Promise<{ status: number; json: unknown }> {
  const method = opts.method ?? "GET";
  const payload = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  const res = await fetch(`http://localhost:${port}${opts.path ?? "/"}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload,
    ...(payload ? { duplex: "half" } as Record<string, unknown> : {}),
  });
  return { status: res.status, json: await res.json() };
}

describe("/api/health endpoint", () => {
  const db = makeDb();
  const roomManager = new RoomManager();

  const app = new Hono();
  app.get("/api/health", (c) => {
    let dbOk = false;
    try {
      db.prepare("SELECT 1").get();
      dbOk = true;
    } catch {
      // DB unreachable
    }
    const roomCount = roomManager.getRoomCount();
    const status = dbOk ? 200 : 503;
    return c.json({ ok: dbOk, db: dbOk ? "ok" : "error", rooms: roomCount, ts: Date.now() }, status);
  });

  const server = buildServer(app);
  let port: number;
  const ready = new Promise<void>((resolve) => server.listen(0, () => {
    port = (server.address() as { port: number }).port;
    resolve();
  }));

  afterAll(() => {
    db.close();
    return new Promise<void>((res) => server.close(() => res()));
  });

  it("returns 200 with db:ok when DB is healthy", async () => {
    await ready;
    const { status, json } = await request(port, { path: "/api/health" });
    expect(status).toBe(200);
    expect((json as Record<string, unknown>).ok).toBe(true);
    expect((json as Record<string, unknown>).db).toBe("ok");
    expect(typeof (json as Record<string, unknown>).rooms).toBe("number");
    expect(typeof (json as Record<string, unknown>).ts).toBe("number");
  });
});

describe("room creation — display name sanitization", () => {
  let db: Database.Database;
  const roomManager = new RoomManager();
  let port: number;
  let server: ReturnType<typeof createServer>;

  const app = new Hono();

  const ready = new Promise<void>((resolve) => {
    db = makeDb();
    const rooms = roomsRouter(roomManager, db);
    app.route("/", rooms);
    server = buildServer(app);
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });

  afterAll(() => {
    db.close();
    return new Promise<void>((res) => server.close(() => res()));
  });

  it("creates room successfully with normal display name", async () => {
    await ready;
    const { status, json } = await request(port, {
      method: "POST",
      path: "/api/rooms",
      body: { displayName: "TestRacer", trackId: "track_city_canyon" },
    });
    expect(status, JSON.stringify(json)).toBe(200);
    expect((json as Record<string, unknown>).slug).toBeTruthy();
    expect((json as Record<string, unknown>).sessionToken).toBeTruthy();
  });

  it("creates room with short display name (1 char) without 500 error", async () => {
    await ready;
    const { status, json } = await request(port, {
      method: "POST",
      path: "/api/rooms",
      body: { displayName: "X", trackId: "track_city_canyon" },
    });
    // Should NOT be a 500 DB error — sanitization pads to 3 chars
    expect(status, JSON.stringify(json)).toBe(200);
    expect((json as Record<string, unknown>).slug).toBeTruthy();
  });

  it("creates room with empty display name without 500 error", async () => {
    await ready;
    const { status, json } = await request(port, {
      method: "POST",
      path: "/api/rooms",
      body: { displayName: "", trackId: "track_city_canyon" },
    });
    expect(status, JSON.stringify(json)).toBe(200);
  });

  it("creates room with XSS display name without injecting HTML", async () => {
    await ready;
    const { status, json } = await request(port, {
      method: "POST",
      path: "/api/rooms",
      body: { displayName: "<script>alert(1)</script>", trackId: "track_city_canyon" },
    });
    expect(status, JSON.stringify(json)).toBe(200);
    // The sessionToken should still be returned
    expect((json as Record<string, unknown>).sessionToken).toBeTruthy();
  });

  it("creates room when displayName is omitted (uses default)", async () => {
    await ready;
    const { status, json } = await request(port, {
      method: "POST",
      path: "/api/rooms",
      body: { trackId: "track_city_canyon" },
    });
    expect(status, JSON.stringify(json)).toBe(200);
  });
});
