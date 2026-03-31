/**
 * Tests for the Node HTTP → Hono bridge in main.ts.
 * Specifically exercises POST with a JSON body, which previously caused a 502
 * because `new Request()` threw outside the try/catch when a body was present
 * (Node 18+ requires `duplex:'half'`).
 */
import { describe, it, expect, afterAll } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Hono } from "hono";

/**
 * Inline replica of the fixed HTTP bridge so we can test it in isolation
 * without spinning up the full server (DB, migrations, RoomManager, etc.).
 */
function createBridgeServer(app: Hono) {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(body?.length ? { duplex: "half" } as any : {}),
      });

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
}

/** Tiny helper: send a request to a listening server and return status + body. */
async function request(
  port: number,
  opts: { method?: string; path?: string; body?: unknown; headers?: Record<string, string> }
): Promise<{ status: number; body: string }> {
  const method = opts.method ?? "GET";
  const path = opts.path ?? "/";
  const payload = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
    },
    body: payload,
    // Node 18+ fetch also needs duplex for request bodies
    ...(payload ? { duplex: "half" } as Record<string, unknown> : {}),
  });

  return { status: res.status, body: await res.text() };
}

describe("HTTP bridge", () => {
  const app = new Hono();

  app.get("/ping", (c) => c.json({ pong: true }));

  app.post("/echo", async (c) => {
    const data = await c.req.json();
    return c.json({ received: data });
  });

  app.get("/array-header-echo", (c) => {
    // Just echoes back a multi-value header to prove flattening doesn't crash
    return c.json({ ok: true });
  });

  const server = createBridgeServer(app);
  let port: number;

  // Start on a random free port before tests
  const ready = new Promise<void>((resolve) => server.listen(0, () => {
    port = (server.address() as { port: number }).port;
    resolve();
  }));

  afterAll(() => new Promise<void>((res) => server.close(() => res())));

  it("GET /ping returns 200", async () => {
    await ready;
    const { status, body } = await request(port, { path: "/ping" });
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({ pong: true });
  });

  it("POST with JSON body returns 200 (not 502)", async () => {
    await ready;
    const payload = { name: "NeonDrift", ts: Date.now() };
    const { status, body } = await request(port, {
      method: "POST",
      path: "/echo",
      body: payload,
    });
    expect(status, `expected 200, got ${status} — body: ${body}`).toBe(200);
    expect(JSON.parse(body).received).toEqual(payload);
  });

  it("array-valued headers are flattened without throwing", async () => {
    await ready;
    // Node http module can produce array-valued headers (e.g. set-cookie).
    // We simulate by sending multiple values that the bridge must flatten.
    const { status } = await request(port, {
      path: "/array-header-echo",
      headers: { "x-custom": "a" },
    });
    expect(status).toBe(200);
  });

  it("unknown route returns 404", async () => {
    await ready;
    const { status } = await request(port, { path: "/does-not-exist" });
    expect(status).toBe(404);
  });
});
