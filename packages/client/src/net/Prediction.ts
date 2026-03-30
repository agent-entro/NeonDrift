import type { PlayerGameState } from "@neondrift/shared";

// ─── Physics constants (MUST match ServerCarPhysics.ts exactly) ───────────────
const TOP_SPEED = 35;
const BOOST_MULTIPLIER = 1.5;
const BOOST_DURATION = 2000;
const ACCELERATION = 20;
const BRAKE_DECEL = 30;
const NATURAL_DECEL = 8;
const MAX_STEER_ANGLE = 1.2;
const LATERAL_FRICTION = 0.6;
const GRAVITY = 18;
const GROUND_Y = 0.5;

interface InputRecord {
  tick: number;
  steering: number;
  throttle: number;
  brake: boolean;
  boost: boolean;
  predictedState: PredictedCarState;
}

export interface PredictedCarState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  lateralVel: number;
  verticalVel: number;
  boostTimer: number;
}

export class ClientPrediction {
  private inputHistory: InputRecord[] = [];
  private currentState: PredictedCarState;
  private correctionTarget: PredictedCarState | null = null;
  private correctionProgress: number = 0;  // 0-1
  private correctionStart: PredictedCarState | null = null;
  private readonly CORRECTION_DURATION_MS = 100;
  private readonly DIVERGENCE_THRESHOLD = 0.5; // meters
  private readonly MAX_HISTORY = 60; // ~3 seconds at 20Hz

  constructor(initialState: PredictedCarState) {
    this.currentState = { ...initialState };
  }

  /**
   * Apply local physics prediction for this tick.
   * Returns the predicted position to render.
   */
  predict(
    tick: number,
    input: { steering: number; throttle: number; brake: boolean; boost: boolean },
    dtMs: number,
  ): PredictedCarState {
    const newState = this.physicsStep(this.currentState, input, dtMs);
    this.currentState = newState;

    this.inputHistory.push({
      tick,
      ...input,
      predictedState: { ...newState },
    });

    // Trim history to MAX_HISTORY entries
    if (this.inputHistory.length > this.MAX_HISTORY) {
      this.inputHistory.splice(0, this.inputHistory.length - this.MAX_HISTORY);
    }

    return { ...newState };
  }

  /**
   * Called when authoritative server state arrives.
   * If divergence > threshold, start smooth correction.
   */
  reconcile(serverState: PlayerGameState, serverTick: number): void {
    // Find the corresponding predicted state in history
    const record = this.inputHistory.find((r) => r.tick === serverTick);

    if (!record) {
      // No matching history — just snap to server state
      this.currentState = serverStateToInternal(serverState);
      return;
    }

    const predicted = record.predictedState;
    const dx = predicted.x - serverState.pos.x;
    const dy = predicted.y - serverState.pos.y;
    const dz = predicted.z - serverState.pos.z;
    const divergence = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (divergence <= this.DIVERGENCE_THRESHOLD) {
      // Small divergence — no correction needed
      return;
    }

    // Re-simulate from the server state forward using stored inputs
    let replayState = serverStateToInternal(serverState);

    const laterIndex = this.inputHistory.findIndex((r) => r.tick === serverTick);
    if (laterIndex >= 0) {
      // Replay all inputs after this tick
      const replayInputs = this.inputHistory.slice(laterIndex + 1);
      for (const rec of replayInputs) {
        replayState = this.physicsStep(
          replayState,
          { steering: rec.steering, throttle: rec.throttle, brake: rec.brake, boost: rec.boost },
          50, // TICK_MS = 50ms at 20Hz
        );
      }
    }

    // Start smooth correction toward the re-simulated state
    this.correctionStart = { ...this.currentState };
    this.correctionTarget = replayState;
    this.correctionProgress = 0;
    this.currentState = replayState;
  }

  /**
   * Apply correction interpolation (call each render frame).
   * Returns the visually-smoothed position.
   */
  applyCorrection(dtMs: number): PredictedCarState {
    if (!this.correctionTarget || !this.correctionStart) {
      return { ...this.currentState };
    }

    this.correctionProgress = Math.min(
      1,
      this.correctionProgress + dtMs / this.CORRECTION_DURATION_MS,
    );

    const t = this.correctionProgress;
    const s = this.correctionStart;
    const e = this.correctionTarget;

    const interpolated: PredictedCarState = {
      x: s.x + (e.x - s.x) * t,
      y: s.y + (e.y - s.y) * t,
      z: s.z + (e.z - s.z) * t,
      yaw: s.yaw + (e.yaw - s.yaw) * t,
      speed: s.speed + (e.speed - s.speed) * t,
      lateralVel: s.lateralVel + (e.lateralVel - s.lateralVel) * t,
      verticalVel: s.verticalVel + (e.verticalVel - s.verticalVel) * t,
      boostTimer: e.boostTimer,
    };

    if (this.correctionProgress >= 1) {
      this.correctionTarget = null;
      this.correctionStart = null;
    }

    return interpolated;
  }

  getCurrentState(): PredictedCarState {
    return { ...this.currentState };
  }

  private physicsStep(
    state: PredictedCarState,
    input: { steering: number; throttle: number; brake: boolean; boost: boolean },
    dtMs: number,
  ): PredictedCarState {
    const dt = dtMs / 1000;

    let { speed, lateralVel, verticalVel, boostTimer, yaw, x, y, z } = state;

    // Boost activation
    if (input.boost && boostTimer <= 0) {
      boostTimer = BOOST_DURATION;
    }

    // Tick boostTimer
    boostTimer = Math.max(0, boostTimer - dtMs);

    // Effective top speed
    const effectiveTopSpeed = TOP_SPEED * (boostTimer > 0 ? BOOST_MULTIPLIER : 1);

    // Accelerate
    if (input.throttle > 0) {
      speed += ACCELERATION * input.throttle * dt;
      if (speed > effectiveTopSpeed) speed = effectiveTopSpeed;
    }

    // Brake
    if (input.brake) {
      speed -= BRAKE_DECEL * dt;
      if (speed < 0) speed = 0;
    }

    // Natural deceleration
    if (input.throttle === 0 && !input.brake) {
      speed = Math.max(0, speed - NATURAL_DECEL * dt);
    }

    // Yaw rate
    yaw += input.steering * MAX_STEER_ANGLE * (speed / TOP_SPEED) * dt;

    // Lateral slip
    lateralVel += input.steering * speed * 0.15 * dt;

    // Lateral friction
    lateralVel *= (1 - LATERAL_FRICTION * dt);

    // Heading vectors
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    // New position
    let newX = x + forwardX * speed * dt + rightX * lateralVel * dt;
    let newZ = z + forwardZ * speed * dt + rightZ * lateralVel * dt;
    let newY = y;

    // Gravity / ground
    const groundY = GROUND_Y;
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

    return { speed, lateralVel, verticalVel, boostTimer, yaw, x: newX, y: newY, z: newZ };
  }
}

function serverStateToInternal(s: PlayerGameState): PredictedCarState {
  // Extract yaw from quaternion (Y-axis rotation only)
  const yaw = 2 * Math.atan2(s.rot.y, s.rot.w);
  const speed = Math.sqrt(s.vel.x * s.vel.x + s.vel.z * s.vel.z);

  return {
    x: s.pos.x,
    y: s.pos.y,
    z: s.pos.z,
    yaw,
    speed,
    lateralVel: 0,
    verticalVel: s.vel.y,
    boostTimer: 0,
  };
}
