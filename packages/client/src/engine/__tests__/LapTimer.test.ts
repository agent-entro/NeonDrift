import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LapTimer } from "../LapTimer.js";

describe("LapTimer", () => {
  let nowValue: number;

  beforeEach(() => {
    nowValue = 0;
    vi.stubGlobal("performance", { now: () => nowValue });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("currentLap starts at 1", () => {
    const timer = new LapTimer(3, 100);
    expect(timer.currentLap).toBe(1);
  });

  it("isFinished starts false", () => {
    const timer = new LapTimer(3, 100);
    expect(timer.isFinished).toBe(false);
  });

  it("lapTimes starts empty", () => {
    const timer = new LapTimer(3, 100);
    expect(timer.lapTimes).toHaveLength(0);
  });

  it("does not complete lap before hasLeftStart", () => {
    const timer = new LapTimer(3, 100);
    // Stay in start zone (< 15% of 100 = 15) and then jump to near start
    // hasLeftStart never becomes true so no lap should complete
    timer.update(5);  // still in start zone
    timer.update(10); // still in start zone
    // Simulate wrap: prev near end but we are using a fresh timer that has
    // prevSegmentIdx=10 (not near end), so crossing won't fire anyway.
    // To truly test: advance prevSegmentIdx to near end WITHOUT setting hasLeftStart
    // We can't do that in one step while keeping hasLeftStart=false,
    // so just verify that with no departure, no lap completes on a normal wrap.
    // The timer stays at segment 10, no wrap-around detected.
    timer.update(9);
    expect(timer.currentLap).toBe(1);
    expect(timer.lapTimes).toHaveLength(0);
  });

  it("completes a lap when segment wraps from end to start after leaving", () => {
    const timer = new LapTimer(3, 100);

    // Move past start zone threshold (>15%)
    timer.update(20); // hasLeftStart = true

    // Advance time
    nowValue = 5000;

    // Simulate wrap: was near end, now near start
    timer.update(91); // prevSegmentIdx near end
    timer.update(3);  // crosses start line

    expect(timer.currentLap).toBe(2);
    expect(timer.lapTimes).toHaveLength(1);
  });

  it("records elapsed ms for completed lap", () => {
    const timer = new LapTimer(3, 100);

    nowValue = 0; // race start
    // Leave start zone
    timer.update(20);

    nowValue = 7500; // 7.5 seconds later

    timer.update(92);
    timer.update(4);

    expect(timer.lapTimes[0]).toBeCloseTo(7500, -1);
  });

  it("isFinished becomes true after totalLaps completions", () => {
    const timer = new LapTimer(2, 100);

    // Lap 1
    timer.update(20);
    timer.update(92);
    timer.update(4);

    // Lap 2
    timer.update(20);
    timer.update(92);
    timer.update(4);

    expect(timer.isFinished).toBe(true);
  });

  it("onLapComplete fires with correct lap number and time", () => {
    const timer = new LapTimer(3, 100);
    const cb = vi.fn();
    timer.onLapComplete = cb;

    nowValue = 0;
    timer.update(20);
    nowValue = 3000;
    timer.update(91);
    timer.update(5);

    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith(1, 3000);
  });

  it("onRaceComplete fires after all laps", () => {
    const timer = new LapTimer(2, 100);
    const cb = vi.fn();
    timer.onRaceComplete = cb;

    nowValue = 0;

    // Lap 1
    timer.update(20);
    nowValue = 2000;
    timer.update(91);
    timer.update(5);

    // Lap 2
    timer.update(20);
    nowValue = 5000;
    timer.update(91);
    timer.update(5);

    expect(cb).toHaveBeenCalledOnce();
    const [totalTime, lapTimesArg] = cb.mock.calls[0];
    expect(totalTime).toBeCloseTo(5000, -1);
    expect(lapTimesArg).toHaveLength(2);
  });

  it("does not fire onRaceComplete before all laps done", () => {
    const timer = new LapTimer(3, 100);
    const cb = vi.fn();
    timer.onRaceComplete = cb;

    // Only complete 2 of 3 laps
    timer.update(20);
    timer.update(91);
    timer.update(5);

    timer.update(20);
    timer.update(91);
    timer.update(5);

    expect(cb).not.toHaveBeenCalled();
  });

  it("totalElapsed returns ms since race start", () => {
    nowValue = 1000;
    const timer = new LapTimer(3, 100);
    nowValue = 4000;
    expect(timer.totalElapsed).toBeCloseTo(3000, -1);
  });

  it("currentLapElapsed returns ms since current lap start", () => {
    nowValue = 0;
    const timer = new LapTimer(3, 100);

    timer.update(20);
    nowValue = 4000;
    timer.update(91);
    timer.update(5);

    // Now on lap 2; lapStartTime was set at nowValue=4000
    nowValue = 6000;
    expect(timer.currentLapElapsed).toBeCloseTo(2000, -1);
  });
});
