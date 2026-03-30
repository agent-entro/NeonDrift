import { describe, it, expect } from "vitest";
import {
  updateCarPhysics,
  DEFAULT_CAR_CONFIG,
  TOP_SPEED,
  BOOST_MULTIPLIER,
  BOOST_DURATION,
  ACCELERATION,
  BRAKE_DECEL,
  NATURAL_DECEL,
  MAX_STEER_ANGLE,
  LATERAL_FRICTION,
  GRAVITY,
  RESPAWN_DELAY,
  type CarPhysicsState,
  type CarPhysicsInput,
} from "../car.js";

function makeState(overrides: Partial<CarPhysicsState> = {}): CarPhysicsState {
  return {
    speed: 0,
    lateralVel: 0,
    verticalVel: 0,
    boostTimer: 0,
    offTrackTimer: 0,
    yaw: 0,
    pos: { x: 0, y: 0.5, z: 0 },
    ...overrides,
  };
}

const noInput: CarPhysicsInput = { steer: 0, throttle: 0, brake: 0, boost: false };

describe("Physics constants sanity checks", () => {
  it("TOP_SPEED is positive", () => {
    expect(TOP_SPEED).toBeGreaterThan(0);
  });

  it("ACCELERATION is positive", () => {
    expect(ACCELERATION).toBeGreaterThan(0);
  });

  it("BRAKE_DECEL is positive", () => {
    expect(BRAKE_DECEL).toBeGreaterThan(0);
  });

  it("NATURAL_DECEL is positive", () => {
    expect(NATURAL_DECEL).toBeGreaterThan(0);
  });

  it("MAX_STEER_ANGLE is positive", () => {
    expect(MAX_STEER_ANGLE).toBeGreaterThan(0);
  });

  it("LATERAL_FRICTION is between 0 and 1", () => {
    expect(LATERAL_FRICTION).toBeGreaterThan(0);
    expect(LATERAL_FRICTION).toBeLessThanOrEqual(1);
  });

  it("GRAVITY is positive", () => {
    expect(GRAVITY).toBeGreaterThan(0);
  });

  it("BOOST_MULTIPLIER > 1", () => {
    expect(BOOST_MULTIPLIER).toBeGreaterThan(1);
  });

  it("BOOST_DURATION > 0", () => {
    expect(BOOST_DURATION).toBeGreaterThan(0);
  });

  it("RESPAWN_DELAY > 0", () => {
    expect(RESPAWN_DELAY).toBeGreaterThan(0);
  });
});

describe("updateCarPhysics — throttle and speed", () => {
  it("speed increases when throttle is applied", () => {
    const state = makeState();
    const input: CarPhysicsInput = { steer: 0, throttle: 1, brake: 0, boost: false };
    const next = updateCarPhysics(state, input, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.speed).toBeGreaterThan(0);
  });

  it("speed increases proportionally with throttle", () => {
    const state = makeState();
    const fullThrottle: CarPhysicsInput = { steer: 0, throttle: 1, brake: 0, boost: false };
    const halfThrottle: CarPhysicsInput = { steer: 0, throttle: 0.5, brake: 0, boost: false };
    const full = updateCarPhysics(state, fullThrottle, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    const half = updateCarPhysics(state, halfThrottle, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(full.speed).toBeGreaterThan(half.speed);
  });

  it("speed does not exceed TOP_SPEED without boost", () => {
    let state = makeState({ speed: TOP_SPEED - 0.1 });
    const input: CarPhysicsInput = { steer: 0, throttle: 1, brake: 0, boost: false };
    for (let i = 0; i < 100; i++) {
      state = updateCarPhysics(state, input, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    }
    expect(state.speed).toBeLessThanOrEqual(TOP_SPEED + 0.001);
  });

  it("speed clamps to boosted top speed during boost", () => {
    const boostedTop = TOP_SPEED * BOOST_MULTIPLIER;
    let state = makeState({ speed: TOP_SPEED, boostTimer: 1000 });
    const input: CarPhysicsInput = { steer: 0, throttle: 1, brake: 0, boost: false };
    for (let i = 0; i < 50; i++) {
      state = updateCarPhysics(state, input, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    }
    expect(state.speed).toBeLessThanOrEqual(boostedTop + 0.001);
    expect(state.speed).toBeGreaterThan(TOP_SPEED - 0.001);
  });

  it("speed decreases when no throttle (natural decel)", () => {
    const state = makeState({ speed: 20 });
    const next = updateCarPhysics(state, noInput, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.speed).toBeLessThan(20);
  });

  it("speed does not go below 0 with natural decel", () => {
    let state = makeState({ speed: 0.1 });
    for (let i = 0; i < 10; i++) {
      state = updateCarPhysics(state, noInput, 0.5, DEFAULT_CAR_CONFIG, 0, null);
    }
    expect(state.speed).toBeGreaterThanOrEqual(0);
  });

  it("brake decelerates faster than natural decel", () => {
    const state = makeState({ speed: 20 });
    const brakeInput: CarPhysicsInput = { steer: 0, throttle: 0, brake: 1, boost: false };
    const braked = updateCarPhysics(state, brakeInput, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    const natural = updateCarPhysics(state, noInput, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(braked.speed).toBeLessThan(natural.speed);
  });

  it("speed does not go negative when braking from near zero", () => {
    const state = makeState({ speed: 0.5 });
    const brakeInput: CarPhysicsInput = { steer: 0, throttle: 0, brake: 1, boost: false };
    const next = updateCarPhysics(state, brakeInput, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.speed).toBeGreaterThanOrEqual(0);
  });
});

describe("updateCarPhysics — boost", () => {
  it("activates boost when boost=true and boostTimer is 0", () => {
    const state = makeState();
    const input: CarPhysicsInput = { steer: 0, throttle: 0, brake: 0, boost: true };
    const next = updateCarPhysics(state, input, 0.016, DEFAULT_CAR_CONFIG, 0, null);
    // boostTimer should be approximately BOOST_DURATION - dt*1000
    expect(next.boostTimer).toBeGreaterThan(0);
    expect(next.boostTimer).toBeLessThanOrEqual(BOOST_DURATION);
  });

  it("does not re-activate boost when boostTimer > 0", () => {
    const state = makeState({ boostTimer: 1000 });
    const input: CarPhysicsInput = { steer: 0, throttle: 0, brake: 0, boost: true };
    const next = updateCarPhysics(state, input, 0.016, DEFAULT_CAR_CONFIG, 0, null);
    // Timer should just count down from 1000, not reset to BOOST_DURATION
    expect(next.boostTimer).toBeLessThan(1000);
    expect(next.boostTimer).toBeGreaterThan(900);
  });

  it("boostTimer decreases per update", () => {
    const state = makeState({ boostTimer: 500 });
    const next = updateCarPhysics(state, noInput, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.boostTimer).toBeCloseTo(400, 0);
  });

  it("boostTimer reaches 0 and does not go negative", () => {
    let state = makeState({ boostTimer: 100 });
    for (let i = 0; i < 20; i++) {
      state = updateCarPhysics(state, noInput, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    }
    expect(state.boostTimer).toBe(0);
  });
});

describe("updateCarPhysics — steering and yaw", () => {
  it("yaw changes when steering at speed", () => {
    const state = makeState({ speed: 20 });
    const input: CarPhysicsInput = { steer: 1, throttle: 0, brake: 0, boost: false };
    const next = updateCarPhysics(state, input, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.yaw).toBeGreaterThan(0);
  });

  it("yaw does not change when speed is 0", () => {
    const state = makeState({ speed: 0 });
    const input: CarPhysicsInput = { steer: 1, throttle: 0, brake: 0, boost: false };
    const next = updateCarPhysics(state, input, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.yaw).toBe(0);
  });

  it("left steer gives negative yaw change", () => {
    const state = makeState({ speed: 20 });
    const input: CarPhysicsInput = { steer: -1, throttle: 0, brake: 0, boost: false };
    const next = updateCarPhysics(state, input, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.yaw).toBeLessThan(0);
  });
});

describe("updateCarPhysics — lateral velocity (drift)", () => {
  it("lateral velocity builds up with steering at speed", () => {
    const state = makeState({ speed: 20 });
    const input: CarPhysicsInput = { steer: 1, throttle: 0, brake: 0, boost: false };
    const next = updateCarPhysics(state, input, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.lateralVel).toBeGreaterThan(0);
  });

  it("lateral velocity decays with lateral friction", () => {
    const state = makeState({ lateralVel: 5 });
    const next = updateCarPhysics(state, noInput, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.lateralVel).toBeLessThan(5);
    expect(next.lateralVel).toBeGreaterThan(0);
  });
});

describe("updateCarPhysics — position", () => {
  it("car moves forward (in +Z) when yaw=0 and throttle applied", () => {
    const state = makeState();
    const input: CarPhysicsInput = { steer: 0, throttle: 1, brake: 0, boost: false };
    const next = updateCarPhysics(state, input, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    // yaw=0: forwardX=sin(0)=0, forwardZ=cos(0)=1 → moves in +Z
    expect(next.pos.z).toBeGreaterThan(0);
    expect(next.pos.x).toBeCloseTo(0, 5);
  });

  it("wall push applies to position", () => {
    const state = makeState({ pos: { x: 0, y: 0.5, z: 0 } });
    const next = updateCarPhysics(state, noInput, 0.1, DEFAULT_CAR_CONFIG, 0, { x: 2, z: 0 });
    expect(next.pos.x).toBeCloseTo(2, 3);
  });

  it("wall push reflects lateral velocity", () => {
    const state = makeState({ lateralVel: 5 });
    const next = updateCarPhysics(state, noInput, 0.1, DEFAULT_CAR_CONFIG, 0, { x: 0, z: 0 }, -1.5);
    expect(next.lateralVel).toBeCloseTo(-1.5, 3);
  });
});

describe("updateCarPhysics — vertical / gravity", () => {
  it("car stays at groundY + 0.5 when on ground", () => {
    const state = makeState({ pos: { x: 0, y: 0.5, z: 0 } });
    const next = updateCarPhysics(state, noInput, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    expect(next.pos.y).toBeCloseTo(0.5, 3);
    expect(next.verticalVel).toBe(0);
  });

  it("car falls when above ground", () => {
    const state = makeState({ pos: { x: 0, y: 10, z: 0 }, verticalVel: 0 });
    const next = updateCarPhysics(state, noInput, 0.1, DEFAULT_CAR_CONFIG, 0, null);
    // verticalVel should go negative (gravity applied)
    expect(next.verticalVel).toBeLessThan(0);
  });
});
