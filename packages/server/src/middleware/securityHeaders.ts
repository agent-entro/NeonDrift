/**
 * Security headers middleware for Hono.
 * Adds CSP, X-Frame-Options, and other hardening headers to every response.
 * Also exports sanitizeDisplayName (canonical location).
 */

import type { MiddlewareHandler } from "hono";

/**
 * Sanitize display name: strip HTML special chars, collapse whitespace,
 * enforce 3–20 char DB constraint. Returns a safe fallback if too short.
 */
export function sanitizeDisplayName(name: string): string {
  const cleaned = String(name)
    .replace(/[<>&"'`]/g, "")   // strip HTML special chars (XSS)
    .replace(/\s+/g, " ")        // collapse whitespace
    .trim()
    .slice(0, 20);               // max 20 chars (DB constraint)

  // DB CHECK: length BETWEEN 3 AND 20 — pad rather than silently reject
  if (cleaned.length === 0) return "Racer";
  if (cleaned.length < 3) return cleaned.padEnd(3, "_");
  return cleaned;
}

/**
 * Content-Security-Policy for the API server.
 * The game client is served separately (Vite/Cloudflare Pages), so the API
 * server only serves JSON — no scripts or frames needed.
 */
const CSP = [
  "default-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header("Content-Security-Policy", CSP);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "interest-cohort=()");
  };
}

/**
 * Attach a session token as an HttpOnly cookie in addition to the JSON body.
 * Path is scoped to /api so it isn't leaked to non-API routes.
 */
export function setSessionCookie(
  c: Parameters<MiddlewareHandler>[0],
  token: string,
  maxAgeSeconds = 7 * 24 * 60 * 60, // 7 days
): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  c.header(
    "Set-Cookie",
    `nd_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAgeSeconds}${secure}`,
  );
}
