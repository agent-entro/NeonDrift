/**
 * Server-side car physics — pure functions, no Babylon.js.
 * Constants MUST match packages/client/src/engine/car.ts exactly.
 *
 * SYNC CONTRACT: Every constant and formula in this file must be byte-for-byte
 * equivalent to the corresponding logic in client/src/engine/car.ts.
 * Any divergence causes the server to broadcast wrong positions, which all
 * remote clients display as ghost cars at impossible locations.
 */

// ─── Physics constants (MUST match client/src/engine/car.ts) ──────────────────
const TOP_SPEED = 35;           // m/s  — matches client
const BOOST_MULTIPLIER = 1.5;
const BOOST_DURATION = 2000;    // ms
const ACCELERATION = 20;        // m/s²
const BRAKE_DECEL = 30;         // m/s²
const NATURAL_DECEL = 8;        // m/s²
const MAX_STEER_ANGLE = 1.6;    // rad/s — MUST match client (was 1.2: caused 2.7× turning divergence)
const LATERAL_FRICTION = 0.6;   // friction coefficient
const GRAVITY = 18;             // m/s²
// GROUND_Y = 0 matches the client's flat-section track segments (RAW_WAYPOINTS y=0).
// The car body half-height offset of 0.5 is applied on top in both server and client,
// producing a grounded car at y=0.5.  The old value of 0.5 put the server at y=1.0
// while the client sat at y=0.5 — a permanent 0.5 m vertical desync visible as all
// ghost cars floating above the road surface.
const GROUND_Y = 0;             // world flat-section ground height — MUST stay 0

export interface ServerCarState {
  speed: number;
  lateralVel: number;
  verticalVel: number;
  boostTimer: number;
  yaw: number;
  x: number;
  y: number;
  z: number;
}

export interface ServerCarInput {
  steering: number;  // -1 to +1
  throttle: number;  // 0 to 1
  brake: boolean;
  boost: boolean;
}

/**
 * Step server physics for one tick.
 * @param state          Current car state (immutable)
 * @param input          Player input for this tick
 * @param dtMs           Delta time in milliseconds
 * @param terrainGroundY Optional terrain Y at the car's current XZ position.
 *                       Provided by GameRoom after a getTerrainGroundY() call so
 *                       the server correctly handles the ramp section (up to y=8).
 *                       Defaults to GROUND_Y (0) for flat sections.
 * @returns              New car state after one physics step
 */
export function stepServerPhysics(
  state: ServerCarState,
  input: ServerCarInput,
  dtMs: number,
  terrainGroundY = GROUND_Y,
): ServerCarState {
  const dt = dtMs / 1000; // convert to seconds

  let { speed, lateralVel, verticalVel, boostTimer, yaw, x, y, z } = state;

  // 1. Boost activation
  if (input.boost && boostTimer <= 0) {
    boostTimer = BOOST_DURATION;
  }

  // 2. Tick boostTimer
  boostTimer = Math.max(0, boostTimer - dtMs);

  // 3. Effective top speed
  const effectiveTopSpeed = TOP_SPEED * (boostTimer > 0 ? BOOST_MULTIPLIER : 1);

  // 4. Accelerate
  if (input.throttle > 0) {
    speed += ACCELERATION * input.throttle * dt;
    if (speed > effectiveTopSpeed) speed = effectiveTopSpeed;
  }

  // 5. Brake
  if (input.brake) {
    speed -= BRAKE_DECEL * dt;
    if (speed < 0) speed = 0;
  }

  // 6. Natural deceleration
  if (input.throttle === 0 && !input.brake) {
    speed = Math.max(0, speed - NATURAL_DECEL * dt);
  }

  // 7. Yaw rate — ramp to full authority at 30% of top speed.
  // MUST match client car.ts: Math.min(1, speed / (TOP_SPEED * 0.3))
  // The old linear formula (speed / TOP_SPEED) gave only 0.5× factor at cruise
  // while the client reached 1.0× — a 2× divergence in turning rate every tick.
  const steerFactor = Math.min(1, speed / (TOP_SPEED * 0.3));
  yaw += input.steering * MAX_STEER_ANGLE * steerFactor * dt;

  // 8. Drift: lateral slip builds with throttle + steering
  lateralVel += input.steering * speed * 0.15 * dt;

  // 9. Lateral friction
  lateralVel *= (1 - LATERAL_FRICTION * dt);

  // 10. Compute heading vectors
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  // 11. New position
  let newX = x + forwardX * speed * dt + rightX * lateralVel * dt;
  let newZ = z + forwardZ * speed * dt + rightZ * lateralVel * dt;
  let newY = y;

  // 12 & 13. Gravity / ground
  // Use caller-supplied terrainGroundY so ramp sections work correctly.
  // On flat parts terrainGroundY === GROUND_Y === 0.  On the ramp it can be
  // up to 8 m, matching the client's track.getGroundY() result.
  const groundY = terrainGroundY;
  const isAboveGround = newY > groundY + 0.5 + 0.01;
  if (isAboveGround) {
    verticalVel -= GRAVITY * dt;
    newY += verticalVel * dt;
    if (newY < groundY + 0.5) {
      newY = groundY + 0.5;
      verticalVel = 0;
    }
  } else {
    verticalVel = 0;
    newY = groundY + 0.5;
  }

  return {
    speed,
    lateralVel,
    verticalVel,
    boostTimer,
    yaw,
    x: newX,
    y: newY,
    z: newZ,
  };
}

/**
 * Create a default (stopped) car state at the given position.
 */
export function createDefaultCarState(
  x = 0,
  y = GROUND_Y + 0.5,
  z = 0,
  yaw = 0,
): ServerCarState {
  return {
    speed: 0,
    lateralVel: 0,
    verticalVel: 0,
    boostTimer: 0,
    yaw,
    x,
    y,
    z,
  };
}
