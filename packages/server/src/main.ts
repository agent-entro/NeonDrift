import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { Hono } from "hono";
import { initDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? join(__dirname, "..", "data", "neondrift.db");
const MIGRATIONS_DIR = join(__dirname, "migrations");

// ─── Database ────────────────────────────────────────────────────────────────
mkdirSync(join(__dirname, "..", "data"), { recursive: true });
const db = initDb(DB_PATH);
runMigrations(db, MIGRATIONS_DIR);

// ─── HTTP app ─────────────────────────────────────────────────────────────────
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));
app.get("/api/rooms", (c) => c.json({ rooms: [] }));
app.post("/api/rooms", (c) => c.json({ error: "not_implemented" }, 501));
app.get("/api/rooms/:slug", (c) => c.json({ error: "not_implemented" }, 501));
app.post("/api/rooms/:slug/join", (c) => c.json({ error: "not_implemented" }, 501));
app.post("/api/matchmaking/join", (c) => c.json({ error: "not_implemented" }, 501));
app.delete("/api/matchmaking", (c) => c.json({ ok: true }));

// ─── HTTP server ──────────────────────────────────────────────────────────────
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = `http://localhost${req.url ?? "/"}`;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  const honoReq = new Request(url, {
    method: req.method ?? "GET",
    headers: req.headers as HeadersInit,
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

wss.on("connection", (socket, req) => {
  console.log("[ws] client connected:", req.socket.remoteAddress);
  socket.on("message", (data) => {
    console.log("[ws] message, len:", data.toString().length);
  });
  socket.on("close", () => console.log("[ws] client disconnected"));
  socket.on("error", (err) => console.error("[ws] error:", err.message));
});

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[server] NeonDrift running on http://localhost:${PORT}`);
  console.log(`[server] WebSocket: ws://localhost:${PORT}/ws`);
});

process.on("SIGINT", () => {
  console.log("\n[server] shutting down...");
  wss.close();
  httpServer.close(() => { db.close(); process.exit(0); });
});
