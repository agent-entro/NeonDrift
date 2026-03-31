import { describe, it, expect } from "vitest";
import {
  stepServerPhysics,
  createDefaultCarState,
  type ServerCarState,
  type ServerCarInput,
} from "../game/ServerCarPhysics.js";

const TICK_MS = 50; // 20Hz

function zeroInput(): ServerCarInput {
  return { steering: 0, throttle: 0, brake: false, boost: false };
}

function throttleInput(throttle = 1): ServerCarInput {
  return { steering: 0, throttle, brake: false, boost: false };
}

function brakeInput(): ServerCarInput {
  return { steering: 0, throttle: 0, brake: true, boost: false };
}

describe("ServerCarPhysics", () => {
  it("creates a default car state at rest", () => {
    const state = createDefaultCarState();
    expect(state.speed).toBe(0);
    expect(state.lateralVel).toBe(0);
    expect(state.verticalVel).toBe(0);
    expect(state.boostTimer).toBe(0);
    expect(state.yaw).toBe(0);
    expect(state.x).toBe(0);
    expect(state.z).toBe(0);
    // y should be GROUND_Y (0) + car half-height (0.5) = 0.5
    // GROUND_Y was corrected from 0.5 → 0 to match the client's flat-section
    // track segments (RAW_WAYPOINTS y = 0), eliminating the 0.5 m vertical desync.
    expect(state.y).toBe(0.5);
  });

  it("creates a default car state at a given position", () => {
    const state = createDefaultCarState(10, 1, 20, Math.PI);
    expect(state.x).toBe(10);
    expect(state.y).toBe(1);
    expect(state.z).toBe(20);
    expect(state.yaw).toBe(Math.PI);
  });

  it("car accelerates from rest with throttle", () => {
    let state = createDefaultCarState();
    const input = throttleInput(1);

    // Step for 10 ticks (500ms)
    for (let i = 0; i < 10; i++) {
      state = stepServerPhysics(state, input, TICK_MS);
    }

    expect(state.speed).toBeGreaterThan(0);
    expect(state.speed).toBeLessThanOrEqual(35); // <= TOP_SPEED
  });

  it("car reaches top speed eventually", () => {
    let state = createDefaultCarState();
    const input = throttleInput(1);

    // Step for 200 ticks (10 seconds)
    for (let i = 0; i < 200; i++) {
      state = stepServerPhysics(state, input, TICK_MS);
    }

    // Should be at or very near TOP_SPEED
    expect(state.speed).toBeCloseTo(35, 1);
  });

  it("car decelerates when throttle is released", () => {
    // First accelerate
    let state = createDefaultCarState();
    for (let i = 0; i < 60; i++) {
      state = stepServerPhysics(state, throttleInput(1), TICK_MS);
    }
    const speedAfterAccel = state.speed;
    expect(speedAfterAccel).toBeGreaterThan(20);

    // Now coast
    for (let i = 0; i < 20; i++) {
      state = stepServerPhysics(state, zeroInput(), TICK_MS);
    }

    expect(state.speed).toBeLessThan(speedAfterAccel);
  });

  it("car brakes to a stop", () => {
    // First accelerate to some speed
    let state = createDefaultCarState();
    for (let i = 0; i < 40; i++) {
      state = stepServerPhysics(state, throttleInput(1), TICK_MS);
    }
    expect(state.speed).toBeGreaterThan(0);

    // Now brake hard
    for (let i = 0; i < 100; i++) {
      state = stepServerPhysics(state, brakeInput(), TICK_MS);
    }

    expect(state.speed).toBe(0);
  });

  it("speed does not go negative when braking from rest", () => {
    let state = createDefaultCarState();
    // Brake from rest
    for (let i = 0; i < 10; i++) {
      state = stepServerPhysics(state, brakeInput(), TICK_MS);
    }
    expect(state.speed).toBe(0);
  });

  it("car turns with steering input", () => {
    let state = createDefaultCarState();
    // Need speed to turn
    for (let i = 0; i < 20; i++) {
      state = stepServerPhysics(state, throttleInput(1), TICK_MS);
    }

    const initialYaw = state.yaw;

    // Now steer right
    for (let i = 0; i < 10; i++) {
      state = stepServerPhysics(state, { steering: 1, throttle: 1, brake: false, boost: false }, TICK_MS);
    }

    // Yaw should have changed
    expect(state.yaw).not.toBe(initialYaw);
    expect(state.yaw).toBeGreaterThan(initialYaw);
  });

  it("car moves forward with throttle (position changes)", () => {
    let state = createDefaultCarState(0, 1, 0, 0);
    const input = throttleInput(1);

    for (let i = 0; i < 20; i++) {
      state = stepServerPhysics(state, input, TICK_MS);
    }

    // At yaw=0, forward is +Z
    expect(state.z).toBeGreaterThan(0);
  });

  it("boost increases effective top speed", () => {
    // Car at top speed without boost
    let stateNormal = createDefaultCarState();
    for (let i = 0; i < 200; i++) {
      stateNormal = stepServerPhysics(stateNormal, throttleInput(1), TICK_MS);
    }
    expect(stateNormal.speed).toBeCloseTo(35, 0);

    // Car with boost — run for 200 ticks with continuous boost re-activations.
    // Boost duration = 2000ms = 40 ticks. We re-activate it each time it expires
    // by repeatedly sending boost:true (it re-triggers when boostTimer drops to 0).
    let stateBoosted = createDefaultCarState();
    let maxSpeedSeen = 0;
    for (let i = 0; i < 200; i++) {
      stateBoosted = stepServerPhysics(
        stateBoosted,
        { steering: 0, throttle: 1, brake: false, boost: true },
        TICK_MS,
      );
      if (stateBoosted.speed > maxSpeedSeen) maxSpeedSeen = stateBoosted.speed;
    }
    // The car should have exceeded the non-boosted top speed at some point
    expect(maxSpeedSeen).toBeGreaterThan(35);
    expect(maxSpeedSeen).toBeLessThanOrEqual(52.5 + 0.1);
  });

  it("boost timer activates and drains", () => {
    let state = createDefaultCarState();
    state = stepServerPhysics(
      state,
      { steering: 0, throttle: 0, brake: false, boost: true },
      TICK_MS,
    );
    // Boost should have been activated (boostTimer > 0)
    expect(state.boostTimer).toBeGreaterThan(0);
    // Timer should be BOOST_DURATION - TICK_MS = 2000 - 50 = 1950
    expect(state.boostTimer).toBe(1950);
  });

  it("disconnected player (zero input) eventually decelerates", () => {
    // Accelerate first
    let state = createDefaultCarState();
    for (let i = 0; i < 40; i++) {
      state = stepServerPhysics(state, throttleInput(1), TICK_MS);
    }
    const speedAfterAccel = state.speed;
    expect(speedAfterAccel).toBeGreaterThan(10);

    // Simulate disconnected player: zero input
    for (let i = 0; i < 40; i++) {
      state = stepServerPhysics(state, zeroInput(), TICK_MS);
    }

    // Should have decelerated significantly
    expect(state.speed).toBeLessThan(speedAfterAccel);
  });

  it("car stays on ground (y = 0.5) when on flat ground", () => {
    let state = createDefaultCarState();
    for (let i = 0; i < 20; i++) {
      state = stepServerPhysics(state, throttleInput(1), TICK_MS);
    }
    // Y should stay at GROUND_Y (0) + car half-height (0.5) = 0.5
    expect(state.y).toBe(0.5);
  });
});
