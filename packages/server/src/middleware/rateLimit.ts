/**
 * Simple in-memory rate limiter middleware for Hono.
 * Uses a sliding window counter keyed by IP address.
 */

import type { MiddlewareHandler } from "hono";

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

// Periodically sweep stale entries (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
}): MiddlewareHandler {
  const { windowMs, max, keyFn } = opts;

  return async (c, next) => {
    const key = keyFn
      ? keyFn(c.req.raw)
      : (c.req.header("x-forwarded-for") ??
         c.req.header("x-real-ip") ??
         "unknown");

    const now = Date.now();
    let entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "too_many_requests" }, 429);
    }

    await next();
  };
}

// Re-export from canonical location so existing imports keep working
export { sanitizeDisplayName } from "./securityHeaders.js";
