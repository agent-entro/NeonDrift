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

// ─── Server-side wall collision (no Babylon.js) ───────────────────────────────
// The client computes wall response from a 2000-point Catmull-Rom spline.
// The server approximates using the same 28 raw control points — the error at
// sharp corners is small and far better than broadcasting positions inside walls.

/** Road half-width in metres — must match track.ts ROAD_HALF_WIDTH */
const SERVER_ROAD_HALF_WIDTH = 6;
/** Distance from road edge at which push-back activates */
const SERVER_WALL_BUFFER = 1.5;

export interface ServerWallResponse {
  pushX: number;
  pushZ: number;
  newLateralVel: number;
  penetration: number;
}

/**
 * Pure-function wall response for the server physics loop.
 * Uses RENDERED_TRACK_WAYPOINTS to approximate the track centre-line without
 * any Babylon.js dependency.
 *
 * Algorithm mirrors client/src/engine/track.ts TrackSystem.getWallResponse():
 *   1. Find nearest waypoint (same as computeNearestWaypointIdx)
 *   2. Compute track tangent from that waypoint to its successor
 *   3. Derive the right-pointing normal (perpendicular in XZ)
 *   4. Compute lateral offset; if outside (halfWidth - BUFFER), push back
 */
export function computeServerWallResponse(
  x: number,
  z: number,
  lateralVel: number,
): ServerWallResponse | null {
  // Find nearest waypoint index
  let bestIdx = 0;
  let bestDist = Infinity;
  const n = RENDERED_TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    const wp = RENDERED_TRACK_WAYPOINTS[i];
    const dx = x - wp.x;
    const dz = z - wp.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  // Track tangent: direction from nearest waypoint to its successor
  const cur = RENDERED_TRACK_WAYPOINTS[bestIdx];
  const nxt = RENDERED_TRACK_WAYPOINTS[(bestIdx + 1) % n];
  const txRaw = nxt.x - cur.x;
  const tzRaw = nxt.z - cur.z;
  const tLen = Math.sqrt(txRaw * txRaw + tzRaw * tzRaw);
  if (tLen < 1e-6) return null; // degenerate segment, skip
  const tx = txRaw / tLen;
  const tz = tzRaw / tLen;

  // Right-pointing normal (tangent rotated 90° clockwise in XZ):
  // If tangent = (tx, tz), then right-normal = (tz, -tx)
  const nx = tz;
  const nz = -tx;

  // Lateral offset of car from track centre (positive = right side)
  const dpx = x - cur.x;
  const dpz = z - cur.z;
  const lateral = dpx * nx + dpz * nz;
  const absLateral = Math.abs(lateral);

  if (absLateral > SERVER_ROAD_HALF_WIDTH - SERVER_WALL_BUFFER) {
    const side = lateral > 0 ? 1 : -1;
    const penetration = absLateral - (SERVER_ROAD_HALF_WIDTH - SERVER_WALL_BUFFER) + 0.1;
    return {
      pushX: -side * penetration * nx,
      pushZ: -side * penetration * nz,
      newLateralVel: -lateralVel * 0.3,
      penetration,
    };
  }

  return null;
}
