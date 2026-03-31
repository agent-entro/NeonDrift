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
