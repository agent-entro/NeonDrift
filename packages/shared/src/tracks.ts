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
