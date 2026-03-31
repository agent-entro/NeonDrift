import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { Hono } from "hono";
import { initDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { RoomManager } from "./game/RoomManager.js";
import { setupWsHandler } from "./game/WsHandler.js";
import { roomsRouter } from "./routes/rooms.js";
import { matchmakingRouter } from "./routes/matchmaking.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? join(__dirname, "..", "data", "neondrift.db");
const MIGRATIONS_DIR = join(__dirname, "migrations");

// ─── Database ────────────────────────────────────────────────────────────────
mkdirSync(join(__dirname, "..", "data"), { recursive: true });
const db = initDb(DB_PATH);
runMigrations(db, MIGRATIONS_DIR);

// ─── Room manager ─────────────────────────────────────────────────────────────
const roomManager = new RoomManager();

// ─── HTTP app ─────────────────────────────────────────────────────────────────
const app = new Hono();

// CORS middleware for all /api/* routes
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
});

// Handle CORS preflight for all /api/* routes
app.options("/api/*", (c) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return c.body(null, 204);
});

// Health check
app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

// GET /api/rooms — list active rooms
app.get("/api/rooms", (c) => {
  const rooms = roomManager.getActiveRooms().map((r) => ({
    roomId: r.roomId,
    trackId: r.trackId,
    phase: r.getPhase(),
    playerCount: r.getPlayerCount(),
  }));
  return c.json({ rooms });
});

// Mount room and matchmaking routers
const rooms = roomsRouter(roomManager, db);
const matchmaking = matchmakingRouter(roomManager, db);

app.route("/", rooms);
app.route("/", matchmaking);

// Test room creation endpoint (kept for backwards compatibility)
app.post("/api/rooms/create-test", async (c) => {
  const { nanoid } = await import("nanoid");
  const roomId = nanoid(10);
  const room = roomManager.createRoom(roomId, "track_city_canyon", "test-host", 8);
  return c.json({ roomId, wsUrl: `/ws?roomId=${roomId}` });
});

// ─── HTTP server ──────────────────────────────────────────────────────────────
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = `http://localhost${req.url ?? "/"}`;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  const honoReq = new Request(url, {
    method: req.method ?? "GET",
    headers: req.headers as Record<string, string>,
    body: body?.length ? body : undefined,
  });

  try {
    const honoRes = await app.fetch(honoReq);
    const resBody = await honoRes.arrayBuffer();
    res.writeHead(honoRes.status, Object.fromEntries(honoRes.headers.entries()));
    res.end(Buffer.from(resBody));
  } catch (err) {
    console.error("[http] handler error:", err);
    res.writeHead(500);
    res.end(JSON.stringify({ error: "internal_server_error" }));
  }
});

// ─── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
setupWsHandler(wss, roomManager, db);

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[server] NeonDrift running on http://localhost:${PORT}`);
  console.log(`[server] WebSocket: ws://localhost:${PORT}/ws`);
});

process.on("SIGINT", () => {
  console.log("\n[server] shutting down...");
  roomManager.cleanup();
  wss.close();
  httpServer.close(() => { db.close(); process.exit(0); });
});
