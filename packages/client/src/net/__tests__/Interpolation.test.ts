import { describe, it, expect, beforeEach } from "vitest";
import { RemoteInterpolation } from "../Interpolation.js";
import type { PlayerGameState } from "@neondrift/shared";

function makeState(id: string, x: number, z: number): PlayerGameState {
  return {
    id,
    pos: { x, y: 1.0, z },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    vel: { x: 0, y: 0, z: 0 },
    lap: 0,
    powerup: null,
    finished: false,
    finish_time_ms: null,
  };
}

describe("RemoteInterpolation", () => {
  let interp: RemoteInterpolation;

  beforeEach(() => {
    interp = new RemoteInterpolation();
  });

  it("returns empty map when no snapshots added", () => {
    const result = interp.getInterpolated(Date.now(), 0);
    expect(result.size).toBe(0);
  });

  it("addSnapshot() buffers states", () => {
    const t = 1000;
    interp.addSnapshot(t, [makeState("p1", 0, 0)]);

    // With serverTimeOffset=0, render time = clientNow - 150ms
    // If clientNow = 1200, render time = 1200 - 150 = 1050 > t=1000 => use t=1000
    const result = interp.getInterpolated(1200, 0);
    expect(result.has("p1")).toBe(true);
    expect(result.get("p1")!.pos.x).toBe(0);
  });

  it("getInterpolated() interpolates positions between two snapshots", () => {
    const t1 = 1000;
    const t2 = 1050; // 50ms apart (one tick at 20Hz)

    interp.addSnapshot(t1, [makeState("p1", 0, 0)]);
    interp.addSnapshot(t2, [makeState("p1", 10, 0)]);

    // Render at time t1 + 25ms = 1025 (halfway between t1 and t2)
    // clientNow + serverTimeOffset - 150 = 1025
    // => clientNow = 1025 - serverTimeOffset + 150 = 1175 (with offset=0)
    const result = interp.getInterpolated(1175, 0);

    const p1 = result.get("p1");
    expect(p1).toBeDefined();
    // Should be interpolated at t=0.5 => x ≈ 5
    expect(p1!.pos.x).toBeCloseTo(5, 0);
  });

  it("returns latest snapshot when only future snapshots exist", () => {
    const now = Date.now();
    interp.addSnapshot(now + 500, [makeState("p1", 10, 10)]);

    const result = interp.getInterpolated(now, 0);
    expect(result.has("p1")).toBe(true);
    expect(result.get("p1")!.pos.x).toBe(10);
  });

  it("returns latest snapshot when all snapshots are in the past", () => {
    const t = 500;
    interp.addSnapshot(t, [makeState("p1", 5, 5)]);

    // clientNow - BUFFER_TIME_MS >> t
    const result = interp.getInterpolated(1000, 0);
    expect(result.has("p1")).toBe(true);
    expect(result.get("p1")!.pos.x).toBe(5);
  });

  it("handles multiple players in a snapshot", () => {
    const t = 1000;
    interp.addSnapshot(t, [
      makeState("p1", 0, 0),
      makeState("p2", 100, 100),
      makeState("p3", -50, 50),
    ]);

    const result = interp.getInterpolated(1200, 0);
    expect(result.has("p1")).toBe(true);
    expect(result.has("p2")).toBe(true);
    expect(result.has("p3")).toBe(true);
  });

  it("old snapshots are pruned beyond MAX_BUFFER (10)", () => {
    // Add 15 snapshots
    for (let i = 0; i < 15; i++) {
      interp.addSnapshot(i * 50, [makeState("p1", i, 0)]);
    }

    // Should still work without error and return latest data
    const result = interp.getInterpolated(15 * 50 + 100, 0);
    expect(result.has("p1")).toBe(true);
  });

  it("player missing from earlier snapshot uses later snapshot state", () => {
    const t1 = 1000;
    const t2 = 1050;

    // p1 only appears in t2
    interp.addSnapshot(t1, [makeState("p2", 0, 0)]);
    interp.addSnapshot(t2, [makeState("p1", 10, 10), makeState("p2", 5, 0)]);

    // clientNow + 0 - 150 = 1025 => clientNow = 1175
    const result = interp.getInterpolated(1175, 0);

    // p1 not in t1, should use t2 directly
    expect(result.has("p1")).toBe(true);
    expect(result.get("p1")!.pos.x).toBe(10);

    // p2 should be interpolated
    expect(result.has("p2")).toBe(true);
  });

  it("lerps velocity along with position", () => {
    const t1 = 1000;
    const t2 = 1050;
    // clientNow such that renderTime = 1025 (midpoint): clientNow = 1025 + 150 = 1175

    const s1: PlayerGameState = {
      id: "p1",
      pos: { x: 0, y: 1, z: 0 },
      rot: { x: 0, y: 0, z: 0, w: 1 },
      vel: { x: 0, y: 0, z: 10 },
      lap: 0,
      powerup: null,
      finished: false,
      finish_time_ms: null,
    };
    const s2: PlayerGameState = {
      id: "p1",
      pos: { x: 0, y: 1, z: 5 },
      rot: { x: 0, y: 0, z: 0, w: 1 },
      vel: { x: 0, y: 0, z: 20 },
      lap: 0,
      powerup: null,
      finished: false,
      finish_time_ms: null,
    };

    interp.addSnapshot(t1, [s1]);
    interp.addSnapshot(t2, [s2]);

    // Render at midpoint: clientNow = 1175, renderTime = 1175 + 0 - 150 = 1025
    const result = interp.getInterpolated(1175, 0);
    const p1 = result.get("p1")!;

    // Velocity should be interpolated
    expect(p1.vel.z).toBeCloseTo(15, 0);
    expect(p1.pos.z).toBeCloseTo(2.5, 0);
  });

  it("snapshots are kept sorted by server time", () => {
    // Add in reverse order
    interp.addSnapshot(1100, [makeState("p1", 20, 0)]);
    interp.addSnapshot(1000, [makeState("p1", 0, 0)]);
    interp.addSnapshot(1050, [makeState("p1", 10, 0)]);

    // Render at midpoint between 1000 and 1050 (renderTime = 1025)
    // clientNow + 0 - 150 = 1025 => clientNow = 1175
    const result = interp.getInterpolated(1175, 0);
    const p1 = result.get("p1")!;

    // Should interpolate between x=0 (t=1000) and x=10 (t=1050) at t=0.5
    expect(p1.pos.x).toBeCloseTo(5, 0);
  });

  it("serverTimeOffset adjusts render time", () => {
    const t = 1000;
    interp.addSnapshot(t, [makeState("p1", 5, 5)]);

    // With a positive offset (server is 200ms ahead of client)
    // renderTime = clientNow + 200 - 150 = clientNow + 50
    // If clientNow = 950, renderTime = 1000 => exactly at t
    const result = interp.getInterpolated(950, 200);
    expect(result.has("p1")).toBe(true);
  });
});
