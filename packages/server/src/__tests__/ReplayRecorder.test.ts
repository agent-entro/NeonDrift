import { describe, it, expect, afterEach } from "vitest";
import { unlinkSync, existsSync, mkdirSync } from "node:fs";
import { ReplayRecorder } from "../game/ReplayRecorder.js";

const TEST_RACE_ID = "test-race-123";

afterEach(() => {
  try {
    const p = ReplayRecorder.getPath(TEST_RACE_ID);
    if (existsSync(p)) unlinkSync(p);
  } catch { /* ignore */ }
});

describe("ReplayRecorder", () => {
  it("getPath sanitizes raceId to prevent path traversal", () => {
    const path = ReplayRecorder.getPath("../../evil");
    expect(path).not.toContain("..");
  });

  it("exists returns false for unknown raceId", () => {
    expect(ReplayRecorder.exists("nonexistent-race-xyz")).toBe(false);
  });

  it("records frames and finish returns path", () => {
    const rec = new ReplayRecorder(TEST_RACE_ID);
    rec.start();

    rec.recordTick({
      tick: 0,
      server_time: Date.now(),
      players: [
        {
          id: "p1",
          pos: { x: 0, y: 0, z: 0 },
          rot: { x: 0, y: 0, z: 0, w: 1 },
          vel: { x: 1, y: 0, z: 0 },
          lap: 0,
          powerup: null,
          finished: false,
          finish_time_ms: null,
        },
      ],
      powerups: [],
    });

    const path = rec.finish();
    expect(path).not.toBeNull();
    expect(existsSync(path!)).toBe(true);
    expect(ReplayRecorder.exists(TEST_RACE_ID)).toBe(true);
  });

  it("finish returns null if no frames recorded", () => {
    const rec = new ReplayRecorder(TEST_RACE_ID);
    rec.start();
    const path = rec.finish();
    expect(path).toBeNull();
  });

  it("path getter returns correct path", () => {
    const rec = new ReplayRecorder(TEST_RACE_ID);
    expect(rec.path).toContain(TEST_RACE_ID);
  });
});
