/**
 * Replay API routes.
 * GET /api/replays/:raceId — stream the binary replay file
 */

import { Hono } from "hono";
import { createReadStream, statSync } from "node:fs";
import { ReplayRecorder } from "../game/ReplayRecorder.js";

export function replaysRouter(): Hono {
  const app = new Hono();

  app.get("/api/replays/:raceId", (c) => {
    const raceId = c.req.param("raceId");

    // Basic validation
    if (!raceId || !/^[a-zA-Z0-9_-]+$/.test(raceId)) {
      return c.json({ error: "invalid_race_id" }, 400);
    }

    if (!ReplayRecorder.exists(raceId)) {
      return c.json({ error: "replay_not_found" }, 404);
    }

    const path = ReplayRecorder.getPath(raceId);

    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      return c.json({ error: "replay_not_found" }, 404);
    }

    const stream = createReadStream(path);

    // Convert Node.js ReadStream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${raceId}.bin"`,
        "Cache-Control": "public, max-age=604800", // 7 days
      },
    });
  });

  return app;
}
