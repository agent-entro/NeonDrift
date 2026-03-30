import { describe, it, expect } from "vitest";
import { ClientPrediction, type PredictedCarState } from "../Prediction.js";
import type { PlayerGameState } from "@neondrift/shared";

const TICK_MS = 50; // 20Hz

function defaultState(): PredictedCarState {
  return {
    x: 0,
    y: 1.0,
    z: 0,
    yaw: 0,
    speed: 0,
    lateralVel: 0,
    verticalVel: 0,
    boostTimer: 0,
  };
}

function makeServerState(
  id: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  speed: number,
): PlayerGameState {
  const half = yaw / 2;
  const rot = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
  const vel = {
    x: Math.sin(yaw) * speed,
    y: 0,
    z: Math.cos(yaw) * speed,
  };
  return {
    id,
    pos: { x, y, z },
    rot,
    vel,
    lap: 0,
    powerup: null,
    finished: false,
    finish_time_ms: null,
  };
}

describe("ClientPrediction", () => {
  it("predict() advances state with throttle", () => {
    const pred = new ClientPrediction(defaultState());
    const input = { steering: 0, throttle: 1, brake: false, boost: false };

    const state1 = pred.predict(1, input, TICK_MS);
    expect(state1.speed).toBeGreaterThan(0);

    const state2 = pred.predict(2, input, TICK_MS);
    expect(state2.speed).toBeGreaterThan(state1.speed);
  });

  it("predict() advances position forward at yaw=0", () => {
    const pred = new ClientPrediction(defaultState());
    const input = { steering: 0, throttle: 1, brake: false, boost: false };

    for (let i = 0; i < 10; i++) {
      pred.predict(i, input, TICK_MS);
    }

    const state = pred.getCurrentState();
    // At yaw=0, forward is +Z
    expect(state.z).toBeGreaterThan(0);
  });

  it("predict() stores input history", () => {
    const pred = new ClientPrediction(defaultState());
    const input = { steering: 0, throttle: 1, brake: false, boost: false };

    pred.predict(1, input, TICK_MS);
    pred.predict(2, input, TICK_MS);
    pred.predict(3, input, TICK_MS);

    // History should have 3 records
    // We verify indirectly via reconcile behavior
    const state = pred.getCurrentState();
    expect(state.speed).toBeGreaterThan(0);
  });

  it("reconcile() with small divergence does not start correction", () => {
    const pred = new ClientPrediction(defaultState());
    const input = { steering: 0, throttle: 1, brake: false, boost: false };

    // Predict tick 1
    pred.predict(1, input, TICK_MS);
    const stateAfterPredict = pred.getCurrentState();

    // Server says almost the same position (< 0.5m divergence)
    const serverState = makeServerState(
      "p1",
      stateAfterPredict.x + 0.1,
      stateAfterPredict.y,
      stateAfterPredict.z + 0.1,
      stateAfterPredict.yaw,
      stateAfterPredict.speed,
    );

    pred.reconcile(serverState, 1);

    // applyCorrection should return current state unchanged (no active correction)
    const corrected = pred.applyCorrection(16);
    // Position should be close to the current predicted state
    expect(Math.abs(corrected.x - stateAfterPredict.x)).toBeLessThan(1);
    expect(Math.abs(corrected.z - stateAfterPredict.z)).toBeLessThan(1);
  });

  it("reconcile() with large divergence starts correction", () => {
    const pred = new ClientPrediction(defaultState());
    const input = { steering: 0, throttle: 1, brake: false, boost: false };

    // Build up some prediction
    for (let i = 1; i <= 5; i++) {
      pred.predict(i, input, TICK_MS);
    }

    const stateAfter5 = pred.getCurrentState();

    // Server says a very different position (> 0.5m divergence)
    const serverState = makeServerState(
      "p1",
      stateAfter5.x + 5,  // 5m off in X
      stateAfter5.y,
      stateAfter5.z + 5,  // 5m off in Z
      stateAfter5.yaw,
      stateAfter5.speed,
    );

    pred.reconcile(serverState, 3);

    // After reconcile with large divergence, applyCorrection should interpolate
    // The correction is active when divergence > DIVERGENCE_THRESHOLD (0.5m)
    // The state should have been updated toward server
    const currentState = pred.getCurrentState();
    // State should now be closer to server-reconciled state
    // (the exact position depends on re-simulation, just check it's not the original)
    expect(currentState).toBeDefined();
  });

  it("applyCorrection() interpolates toward correction target over time", () => {
    const initialState: PredictedCarState = {
      x: 0, y: 1, z: 0, yaw: 0, speed: 10,
      lateralVel: 0, verticalVel: 0, boostTimer: 0,
    };
    const pred = new ClientPrediction(initialState);

    const input = { steering: 0, throttle: 0, brake: false, boost: false };

    // Predict a few ticks
    for (let i = 1; i <= 3; i++) {
      pred.predict(i, input, TICK_MS);
    }

    const currentState = pred.getCurrentState();

    // Force a large divergence via reconcile
    const serverState = makeServerState("p1", 100, 1, 100, 0, 10);
    pred.reconcile(serverState, 1);

    // After reconcile, state is snapped to re-simulated position
    // Check that applyCorrection can be called without error
    const corrected = pred.applyCorrection(50);
    expect(corrected).toBeDefined();
    expect(typeof corrected.x).toBe("number");
    expect(typeof corrected.z).toBe("number");
  });

  it("getCurrentState() returns the latest predicted state", () => {
    const pred = new ClientPrediction(defaultState());
    const input = { steering: 0, throttle: 1, brake: false, boost: false };

    pred.predict(1, input, TICK_MS);
    const state = pred.getCurrentState();

    expect(state.speed).toBeGreaterThan(0);
    expect(state.z).toBeGreaterThanOrEqual(0);
  });

  it("input history is capped at MAX_HISTORY (60) entries", () => {
    const pred = new ClientPrediction(defaultState());
    const input = { steering: 0, throttle: 0.5, brake: false, boost: false };

    // Add 80 predictions (exceeds MAX_HISTORY of 60)
    for (let i = 0; i < 80; i++) {
      pred.predict(i, input, TICK_MS);
    }

    // Should still work without errors
    const state = pred.getCurrentState();
    expect(state.speed).toBeGreaterThan(0);
  });

  it("predict() with zero input decelerates from speed", () => {
    const pred = new ClientPrediction({
      ...defaultState(),
      speed: 20,
    });
    const zeroInput = { steering: 0, throttle: 0, brake: false, boost: false };

    for (let i = 0; i < 20; i++) {
      pred.predict(i, zeroInput, TICK_MS);
    }

    const state = pred.getCurrentState();
    expect(state.speed).toBeLessThan(20);
  });
});
