import { describe, it, expect } from "vitest";
import {
  ALL_TRACKS,
  TRACK_CITY_CANYON,
  TRACK_ORBITAL_LOOP,
  TRACK_CRYSTAL_CAVERNS,
  getTrackById,
} from "../tracks.js";

describe("tracks", () => {
  it("exports 3 tracks", () => {
    expect(ALL_TRACKS).toHaveLength(3);
  });

  it("each track has required fields", () => {
    for (const track of ALL_TRACKS) {
      expect(track.id).toBeTruthy();
      expect(track.name).toBeTruthy();
      expect(track.slug).toBeTruthy();
      expect(["easy", "medium", "hard"]).toContain(track.difficulty);
      expect(track.lapCount).toBeGreaterThan(0);
      expect(track.waypoints.length).toBeGreaterThan(2);
      expect(track.roadHalfWidth).toBeGreaterThan(0);
      expect(track.wallHeight).toBeGreaterThan(0);
    }
  });

  it("each waypoint has x, y, z", () => {
    for (const track of ALL_TRACKS) {
      for (const wp of track.waypoints) {
        expect(typeof wp.x).toBe("number");
        expect(typeof wp.y).toBe("number");
        expect(typeof wp.z).toBe("number");
      }
    }
  });

  it("TRACK_CITY_CANYON is easy", () => {
    expect(TRACK_CITY_CANYON.difficulty).toBe("easy");
  });

  it("TRACK_ORBITAL_LOOP is medium", () => {
    expect(TRACK_ORBITAL_LOOP.difficulty).toBe("medium");
  });

  it("TRACK_CRYSTAL_CAVERNS is hard", () => {
    expect(TRACK_CRYSTAL_CAVERNS.difficulty).toBe("hard");
  });

  it("Crystal Caverns has elevation changes", () => {
    const yValues = TRACK_CRYSTAL_CAVERNS.waypoints.map((w) => w.y);
    const maxY = Math.max(...yValues);
    const minY = Math.min(...yValues);
    expect(maxY - minY).toBeGreaterThan(0);
  });

  it("getTrackById returns correct track", () => {
    expect(getTrackById("track_city_canyon")).toBe(TRACK_CITY_CANYON);
    expect(getTrackById("track_orbital_loop")).toBe(TRACK_ORBITAL_LOOP);
    expect(getTrackById("track_crystal_caverns")).toBe(TRACK_CRYSTAL_CAVERNS);
  });

  it("getTrackById returns undefined for unknown id", () => {
    expect(getTrackById("nonexistent")).toBeUndefined();
  });

  it("Orbital Loop waypoints form a closed loop", () => {
    const wps = TRACK_ORBITAL_LOOP.waypoints;
    const first = wps[0];
    const last = wps[wps.length - 1];
    expect(first.x).toBeCloseTo(last.x, 1);
    expect(first.z).toBeCloseTo(last.z, 1);
  });
});
