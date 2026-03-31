// ─── Hash Router ──────────────────────────────────────────────────────────────

export type RouteHandler = (params: Record<string, string>) => void;

interface Route {
  pattern: string;
  segments: string[];
  handler: RouteHandler;
}

/**
 * Minimal hash-based router.
 *
 * Patterns:
 *   /                    — exact match
 *   /r/:slug             — param capture
 *   /watch/:roomId       — param capture
 *
 * Usage:
 *   router.on('/', handler)
 *   router.on('/r/:slug', handler)
 *   router.navigate('/r/my-room')
 *   router.start()
 */
export class Router {
  private routes: Route[] = [];

  on(pattern: string, handler: RouteHandler): this {
    const segments = pattern.split("/").filter(Boolean);
    this.routes.push({ pattern, segments, handler });
    return this;
  }

  navigate(path: string): void {
    location.hash = "#" + path;
  }

  start(): void {
    window.addEventListener("hashchange", () => this._dispatch());
    this._dispatch();
  }

  private _dispatch(): void {
    // Get path from hash: '#/r/some-room' → '/r/some-room'
    const raw = location.hash.slice(1) || "/";
    // Normalise: ensure leading slash, strip trailing slash (except root)
    const path = (raw.startsWith("/") ? raw : "/" + raw).replace(/\/$/, "") || "/";

    const pathSegments = path.split("/").filter(Boolean);

    for (const route of this.routes) {
      const params = this._match(route.segments, pathSegments);
      if (params !== null) {
        try {
          route.handler(params);
        } catch (err) {
          console.error("[router] handler error for", route.pattern, err);
        }
        return;
      }
    }

    console.warn("[router] no route matched for path:", path);
  }

  private _match(
    routeSegments: string[],
    pathSegments: string[],
  ): Record<string, string> | null {
    // Both empty → root '/'
    if (routeSegments.length === 0 && pathSegments.length === 0) {
      return {};
    }

    if (routeSegments.length !== pathSegments.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < routeSegments.length; i++) {
      const rs = routeSegments[i];
      const ps = pathSegments[i];

      if (rs.startsWith(":")) {
        params[rs.slice(1)] = decodeURIComponent(ps);
      } else if (rs !== ps) {
        return null;
      }
    }

    return params;
  }
}

export const router = new Router();
