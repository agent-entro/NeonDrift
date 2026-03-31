/**
 * Track waypoint data shared between client and server.
 * Each track is a closed loop of [x, y, z] waypoints.
 * Waypoints define the track centerline; road is built with roadHalfWidth on each side.
 */

export interface TrackWaypoint {
  x: number;
  y: number;
  z: number;
}

export interface TrackDefinition {
  id: string;
  name: string;
  slug: string;
  difficulty: "easy" | "medium" | "hard";
  lapCount: number;
  waypoints: TrackWaypoint[];
  roadHalfWidth: number;
  wallHeight: number;
}

// ─── City Canyon ─────────────────────────────────────────────────────────────
// A figure-8-ish urban circuit. Medium complexity, gentle banks, tight chicane.
// Dimensions: roughly 400m × 300m footprint.
export const TRACK_CITY_CANYON: TrackDefinition = {
  id: "track_city_canyon",
  name: "City Canyon",
  slug: "city-canyon",
  difficulty: "easy",
  lapCount: 3,
  roadHalfWidth: 8,
  wallHeight: 4,
  waypoints: [
    // Start/finish straight
    { x: 0,    y: 0, z: 0   },
    { x: 50,   y: 0, z: 0   },
    { x: 100,  y: 0, z: 0   },
    // Right turn
    { x: 140,  y: 0, z: 20  },
    { x: 160,  y: 0, z: 60  },
    { x: 160,  y: 0, z: 120 },
    // Chicane
    { x: 140,  y: 0, z: 150 },
    { x: 100,  y: 0, z: 160 },
    { x: 60,   y: 0, z: 150 },
    // Long left sweep
    { x: 20,   y: 0, z: 130 },
    { x: -20,  y: 0, z: 160 },
    { x: -60,  y: 0, z: 180 },
    // Hairpin
    { x: -100, y: 0, z: 180 },
    { x: -130, y: 0, z: 160 },
    { x: -130, y: 0, z: 120 },
    { x: -110, y: 0, z: 80  },
    // Long straight back
    { x: -80,  y: 0, z: 40  },
    { x: -40,  y: 0, z: 10  },
    // Back to start
    { x: 0,    y: 0, z: 0   },
  ],
};

// ─── Orbital Loop ─────────────────────────────────────────────────────────────
// A space-station ring track with banked curves and two long straights.
// Dimensions: roughly 500m diameter.
export const TRACK_ORBITAL_LOOP: TrackDefinition = {
  id: "track_orbital_loop",
  name: "Orbital Loop",
  slug: "orbital-loop",
  difficulty: "medium",
  lapCount: 3,
  roadHalfWidth: 10,
  wallHeight: 5,
  waypoints: (() => {
    // Ellipse with 16 segments, stretched 1.5× on Z
    const pts: TrackWaypoint[] = [];
    const N = 16;
    const rx = 200;
    const rz = 300;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      pts.push({
        x: Math.cos(angle) * rx,
        y: 0,
        z: Math.sin(angle) * rz,
      });
    }
    // Close the loop
    pts.push({ ...pts[0] });
    return pts;
  })(),
};

// ─── Crystal Caverns ──────────────────────────────────────────────────────────
// Underground cave system with elevation changes (Y varies), narrow passages,
// sharp turns, and glowing crystal formations (cosmetic).
export const TRACK_CRYSTAL_CAVERNS: TrackDefinition = {
  id: "track_crystal_caverns",
  name: "Crystal Caverns",
  slug: "crystal-caverns",
  difficulty: "hard",
  lapCount: 3,
  roadHalfWidth: 6,
  wallHeight: 6,
  waypoints: [
    { x: 0,    y: 0,  z: 0   },
    { x: 40,   y: 0,  z: -20 },
    { x: 80,   y: 5,  z: -50 },
    { x: 100,  y: 10, z: -100},
    { x: 80,   y: 15, z: -150},
    { x: 40,   y: 15, z: -180},
    { x: 0,    y: 10, z: -200},
    { x: -50,  y: 5,  z: -190},
    { x: -90,  y: 0,  z: -160},
    { x: -100, y: 0,  z: -120},
    { x: -80,  y: 5,  z: -80 },
    { x: -50,  y: 10, z: -50 },
    { x: -20,  y: 5,  z: -20 },
    { x: 0,    y: 0,  z: 0   },
  ],
};

export const ALL_TRACKS: TrackDefinition[] = [
  TRACK_CITY_CANYON,
  TRACK_ORBITAL_LOOP,
  TRACK_CRYSTAL_CAVERNS,
];

export function getTrackById(id: string): TrackDefinition | undefined {
  return ALL_TRACKS.find((t) => t.id === id);
}

// ─── Rendered track waypoints (authoritative) ─────────────────────────────────
// These are the ACTUAL waypoints used by the client renderer (track.ts RAW_WAYPOINTS).
// The server uses them for position-based lap detection.  Both sides share this
// data so the lap trigger is computed consistently without Babylon.js.
//
// 28 unique control points in track order, starting at the start/finish line.
// The raw array closes the loop with a duplicate [0,0,0] at index 28; we omit
// that duplicate here so indices 0–27 are all distinct.
export const RENDERED_TRACK_WAYPOINTS: TrackWaypoint[] = [
  { x: 0,   y: 0, z: 0   }, //  0 — start/finish line
  { x: 0,   y: 0, z: 30  }, //  1
  { x: 0,   y: 0, z: 60  }, //  2
  { x: 10,  y: 0, z: 80  }, //  3
  { x: 30,  y: 0, z: 95  }, //  4
  { x: 60,  y: 0, z: 100 }, //  5
  { x: 100, y: 0, z: 100 }, //  6
  { x: 130, y: 0, z: 90  }, //  7
  { x: 145, y: 0, z: 70  }, //  8
  { x: 145, y: 0, z: 50  }, //  9 — canyon S-curve starts
  { x: 140, y: 0, z: 35  }, // 10
  { x: 150, y: 0, z: 20  }, // 11
  { x: 145, y: 0, z: 5   }, // 12
  { x: 145, y: 0, z: -10 }, // 13 — ramp starts
  { x: 140, y: 3, z: -22 }, // 14
  { x: 135, y: 6, z: -32 }, // 15
  { x: 130, y: 8, z: -42 }, // 16 — ramp peak
  { x: 120, y: 6, z: -52 }, // 17
  { x: 110, y: 3, z: -60 }, // 18
  { x: 95,  y: 0, z: -65 }, // 19 — ramp ends
  { x: 75,  y: 0, z: -75 }, // 20 — right turn west
  { x: 50,  y: 0, z: -80 }, // 21
  { x: 25,  y: 0, z: -80 }, // 22
  { x: 5,   y: 0, z: -75 }, // 23 — left turn north
  { x: -5,  y: 0, z: -60 }, // 24
  { x: 0,   y: 0, z: -40 }, // 25 — chicane
  { x: -8,  y: 0, z: -25 }, // 26
  { x: 5,   y: 0, z: -12 }, // 27 — just before start line
];

/** Number of unique waypoints (0-indexed, 0–27). */
export const RENDERED_TRACK_WAYPOINT_COUNT = 28 as const;

/**
 * Find the index (0–27) of the nearest waypoint in RENDERED_TRACK_WAYPOINTS
 * for a given XZ world position.  Y is ignored (the projection is flat).
 *
 * Used by both server (lap detection) and client (race-position tiebreaker).
 */
export function computeNearestWaypointIdx(x: number, z: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < RENDERED_TRACK_WAYPOINTS.length; i++) {
    const wp = RENDERED_TRACK_WAYPOINTS[i];
    const dx = x - wp.x;
    const dz = z - wp.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDist) {
      bestDist = distSq;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Compute a single monotonic "race score" that encodes both lap and intra-lap
 * position.  Higher score = further ahead in the race.
 *
 *   score = completedLaps × RENDERED_TRACK_WAYPOINT_COUNT + nearestWaypointIdx
 *
 * This lets clients sort all players by a single integer and derive positions
 * without any additional bookkeeping.
 */
export function computeRaceScore(lap: number, x: number, z: number): number {
  return lap * RENDERED_TRACK_WAYPOINT_COUNT + computeNearestWaypointIdx(x, z);
}

// ─── Server-side wall collision and terrain height (no Babylon.js) ───────────
//
// PREVIOUS APPROACH (LATERAL SHIFT BUG):
//   Used 28 raw control-point waypoints to find the nearest centre and compute
//   wall normals.  At curves the inter-waypoint distance is large (~20–40 m),
//   so the "nearest" waypoint could be far from the actual curve centre.  This
//   produced different lateral offsets than the client's 5 600-point spline,
//   causing wall collisions to fire at different positions — the "shifted world
//   frame" desync seen in the screenshot.
//
// CURRENT APPROACH:
//   Build the same Catmull-Rom spline (200 subdivisions per waypoint-to-waypoint
//   segment) that the client renders.  Both sides now find the nearest segment
//   from the same ~5 600-point set, so lateral offsets are identical and wall
//   collision triggers at exactly the same position on every client.
//   The spline table is computed once and cached for the process lifetime.

/** Road half-width in metres — must match track.ts ROAD_HALF_WIDTH */
const SERVER_ROAD_HALF_WIDTH = 6;
/** Distance from road edge at which push-back activates */
const SERVER_WALL_BUFFER = 1.5;
/** Catmull-Rom subdivisions per waypoint segment — MUST match track.ts */
const SPLINE_SUBDIVISIONS = 200;

export interface ServerWallResponse {
  pushX: number;
  pushZ: number;
  newLateralVel: number;
  penetration: number;
}

// ── Catmull-Rom helpers ───────────────────────────────────────────────────────

/** Standard uniform Catmull-Rom interpolation for one scalar component. */
function _cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

interface _SplineSeg {
  cx: number; cy: number; cz: number; // centre (cy = terrain Y)
  nx: number; nz: number;             // right-pointing XZ unit normal
}

let _splineSegs: _SplineSeg[] | null = null;

/**
 * Build and cache the dense Catmull-Rom spline segment table.
 * Mirrors the algorithm in client/src/engine/track.ts TrackSystem._buildTrack().
 * Called once per process; subsequent calls return the cached array.
 */
function _getSplineSegs(): _SplineSeg[] {
  if (_splineSegs !== null) return _splineSegs;

  // Close the loop: append first waypoint at end (same as RAW_WAYPOINTS in track.ts)
  const wps = [...RENDERED_TRACK_WAYPOINTS, RENDERED_TRACK_WAYPOINTS[0]];
  const n = wps.length; // 29 (wps[28] === wps[0])
  const segs: _SplineSeg[] = [];

  for (let i = 0; i < n - 1; i++) {
    const i0 = (i - 1 + n) % n;
    const i1 = i;
    const i2 = (i + 1) % n;
    const i3 = (i + 2) % n;

    const x0 = wps[i0].x, y0 = wps[i0].y, z0 = wps[i0].z;
    const x1 = wps[i1].x, y1 = wps[i1].y, z1 = wps[i1].z;
    const x2 = wps[i2].x, y2 = wps[i2].y, z2 = wps[i2].z;
    const x3 = wps[i3].x, y3 = wps[i3].y, z3 = wps[i3].z;

    for (let j = 0; j < SPLINE_SUBDIVISIONS; j++) {
      const t0 = j / SPLINE_SUBDIVISIONS;
      const t1 = (j + 1) / SPLINE_SUBDIVISIONS;

      const cx = _cr(x0, x1, x2, x3, t0);
      const cy = _cr(y0, y1, y2, y3, t0);
      const cz = _cr(z0, z1, z2, z3, t0);

      // Forward tangent in XZ using the next subdivision point
      const nxp = _cr(x0, x1, x2, x3, t1);
      const nzp = _cr(z0, z1, z2, z3, t1);
      const tdx = nxp - cx;
      const tdz = nzp - cz;
      const tlen = Math.sqrt(tdx * tdx + tdz * tdz) || 1;

      // Right-pointing normal: rotate tangent 90° clockwise in XZ → (tz, -tx)
      segs.push({ cx, cy, cz, nx: tdz / tlen, nz: -(tdx / tlen) });
    }
  }

  _splineSegs = segs;
  return segs;
}

/** Find the nearest spline segment index to world position (x, z). */
function _nearestSegIdx(segs: _SplineSeg[], x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const dx = x - segs[i].cx;
    const dz = z - segs[i].cz;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Get the interpolated terrain ground height at world position (x, z).
 *
 * Returns the Y coordinate of the nearest spline segment centre, which is the
 * same value the client's TrackSystem.getGroundY() returns.  Pass this to
 * stepServerPhysics() as terrainGroundY so the server car rides the ramp
 * correctly instead of being clamped to flat ground (y = 0).
 */
export function getTerrainGroundY(x: number, z: number): number {
  const segs = _getSplineSegs();
  return segs[_nearestSegIdx(segs, x, z)].cy;
}

/**
 * Compute the authoritative wall correction for a car at (x, z).
 *
 * Uses the same ~5 600-point Catmull-Rom spline as the client renderer, so
 * the lateral offset is computed relative to the same track centre line.
 * This eliminates the "world frame shifted left/right" desync that occurred
 * when the server used only 28 raw waypoints (large inter-point gaps on
 * curves produced different nearest-centre results than the client).
 *
 * Algorithm mirrors client/src/engine/track.ts TrackSystem.getWallResponse().
 */
export function computeServerWallResponse(
  x: number,
  z: number,
  lateralVel: number,
): ServerWallResponse | null {
  const segs = _getSplineSegs();
  const idx = _nearestSegIdx(segs, x, z);
  const seg = segs[idx];

  // Lateral offset from segment centre (positive = right side)
  const lateral = (x - seg.cx) * seg.nx + (z - seg.cz) * seg.nz;
  const absLateral = Math.abs(lateral);

  if (absLateral > SERVER_ROAD_HALF_WIDTH - SERVER_WALL_BUFFER) {
    const side = lateral > 0 ? 1 : -1;
    const penetration = absLateral - (SERVER_ROAD_HALF_WIDTH - SERVER_WALL_BUFFER) + 0.1;
    return {
      pushX: -side * penetration * seg.nx,
      pushZ: -side * penetration * seg.nz,
      newLateralVel: -lateralVel * 0.3,
      penetration,
    };
  }

  return null;
}
