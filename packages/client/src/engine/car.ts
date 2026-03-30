/**
 * Arcade car physics controller for NeonDrift.
 * Uses custom mathematical physics — no Havok WASM dependency.
 * Havok integration is planned for Phase 1B refinement.
 */
import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  TransformNode,
  Mesh,
} from "@babylonjs/core";
import type { TrackSystem } from "./track.js";

// ─── Physics constants ────────────────────────────────────────────────────────
export const TOP_SPEED = 35;           // m/s (~125 km/h)
export const BOOST_MULTIPLIER = 1.5;
export const BOOST_DURATION = 2000;    // ms
export const ACCELERATION = 20;        // m/s²
export const BRAKE_DECEL = 30;         // m/s²
export const NATURAL_DECEL = 8;        // m/s² (no throttle)
export const MAX_STEER_ANGLE = 1.2;    // radians/s yaw rate at full speed
export const DRIFT_FACTOR = 0.85;      // how much lateral velocity persists per second
export const LATERAL_FRICTION = 0.6;  // friction coefficient for drift alignment
export const GRAVITY = 18;             // m/s² (slightly exaggerated for arcade feel)
export const RESPAWN_DELAY = 3000;     // ms

export interface CarPhysicsConfig {
  topSpeed: number;
  boostMultiplier: number;
  boostDuration: number;
  acceleration: number;
  brakeDecel: number;
  naturalDecel: number;
  maxSteerAngle: number;
  driftFactor: number;
  lateralFriction: number;
  gravity: number;
  respawnDelay: number;
}

export const DEFAULT_CAR_CONFIG: CarPhysicsConfig = {
  topSpeed: TOP_SPEED,
  boostMultiplier: BOOST_MULTIPLIER,
  boostDuration: BOOST_DURATION,
  acceleration: ACCELERATION,
  brakeDecel: BRAKE_DECEL,
  naturalDecel: NATURAL_DECEL,
  maxSteerAngle: MAX_STEER_ANGLE,
  driftFactor: DRIFT_FACTOR,
  lateralFriction: LATERAL_FRICTION,
  gravity: GRAVITY,
  respawnDelay: RESPAWN_DELAY,
};

export interface CarPhysicsState {
  speed: number;
  lateralVel: number;
  verticalVel: number;
  boostTimer: number;
  offTrackTimer: number;
  yaw: number;
  pos: { x: number; y: number; z: number };
}

export interface CarPhysicsInput {
  steer: number;    // -1 to +1
  throttle: number; // 0 to 1
  brake: number;    // 0 to 1
  boost: boolean;
}

/**
 * Pure function: update car physics state for one frame.
 * This allows testing without a Babylon.js scene.
 */
export function updateCarPhysics(
  state: CarPhysicsState,
  input: CarPhysicsInput,
  dt: number,
  config: CarPhysicsConfig,
  groundY: number,
  wallPush: { x: number; z: number } | null,
  wallNewLateralVel?: number,
): CarPhysicsState {
  let { speed, lateralVel, verticalVel, boostTimer, offTrackTimer, yaw, pos } = state;

  // 1. Boost activation
  if (input.boost && boostTimer <= 0) {
    boostTimer = config.boostDuration;
  }

  // 2. Tick boostTimer
  boostTimer = Math.max(0, boostTimer - dt * 1000);

  // 3. Effective top speed
  const effectiveTopSpeed = config.topSpeed * (boostTimer > 0 ? config.boostMultiplier : 1);

  // 4. Accelerate
  if (input.throttle > 0) {
    speed += config.acceleration * input.throttle * dt;
    if (speed > effectiveTopSpeed) speed = effectiveTopSpeed;
  }

  // 5. Brake
  if (input.brake > 0) {
    speed -= config.brakeDecel * input.brake * dt;
    if (speed < 0) speed = 0;
  }

  // 6. Natural deceleration
  if (input.throttle === 0 && input.brake === 0) {
    speed = Math.max(0, speed - config.naturalDecel * dt);
  }

  // 7. Yaw rate scaled by speed
  yaw += input.steer * config.maxSteerAngle * (speed / config.topSpeed) * dt;

  // 8. Drift: lateral slip builds with throttle + steering
  lateralVel += input.steer * speed * 0.15 * dt;

  // 9. Lateral friction
  lateralVel *= (1 - config.lateralFriction * dt);

  // 10. Compute heading vectors
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  // 11. New position
  let newX = pos.x + forwardX * speed * dt + rightX * lateralVel * dt;
  let newZ = pos.z + forwardZ * speed * dt + rightZ * lateralVel * dt;
  let newY = pos.y;

  // 12 & 13. Gravity / ground
  const isAboveGround = newY > groundY + 0.5 + 0.01;
  if (isAboveGround) {
    verticalVel -= config.gravity * dt;
    newY += verticalVel * dt;
    if (newY < groundY + 0.5) {
      newY = groundY + 0.5;
      verticalVel = 0;
    }
  } else {
    verticalVel = 0;
    newY = groundY + 0.5;
  }

  // 15. Wall collision
  if (wallPush !== null) {
    newX += wallPush.x;
    newZ += wallPush.z;
    if (wallNewLateralVel !== undefined) {
      lateralVel = wallNewLateralVel;
    }
  }

  return {
    speed,
    lateralVel,
    verticalVel,
    boostTimer,
    offTrackTimer,
    yaw,
    pos: { x: newX, y: newY, z: newZ },
  };
}

// ─── CarController class ──────────────────────────────────────────────────────
export class CarController {
  private scene: Scene;
  private track: TrackSystem;

  // Physics state
  private state: CarPhysicsState;
  private config: CarPhysicsConfig;

  // Boost energy (0–1)
  private _boostEnergy: number = 1.0;
  private static readonly BOOST_REGEN_RATE = 0.12;  // per second
  private static readonly BOOST_DRAIN_RATE = 0.45;  // per second
  private static readonly BOOST_MIN_ENERGY = 0.1;   // minimum to activate

  // Mesh
  public rootNode: TransformNode;
  private bodyMesh: Mesh;
  private cabinMesh: Mesh;
  private wheelMeshes: Mesh[] = [];

  // Respawn
  private respawnPending = false;
  private respawnTimer = 0;

  constructor(scene: Scene, trackSystem: TrackSystem) {
    this.scene = scene;
    this.track = trackSystem;
    this.config = { ...DEFAULT_CAR_CONFIG };

    const spawn = trackSystem.spawnPosition;
    this.state = {
      speed: 0,
      lateralVel: 0,
      verticalVel: 0,
      boostTimer: 0,
      offTrackTimer: 0,
      yaw: trackSystem.spawnYaw,
      pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    };

    this.rootNode = new TransformNode("car", scene);

    // Build car meshes
    const bodyMat = new StandardMaterial("carBodyMat", scene);
    bodyMat.diffuseColor = new Color3(0, 0.3, 0.4);
    bodyMat.emissiveColor = new Color3(0, 0.8, 1.0);
    bodyMat.specularColor = new Color3(0.2, 0.4, 0.5);

    // Body: 4×0.9×2m
    this.bodyMesh = MeshBuilder.CreateBox("carBody", { width: 4, height: 0.9, depth: 2 }, scene);
    this.bodyMesh.position.y = 0.45;
    this.bodyMesh.material = bodyMat;
    this.bodyMesh.parent = this.rootNode;

    // Cabin: 2.5×0.7×1.4m
    const cabinMat = new StandardMaterial("carCabinMat", scene);
    cabinMat.diffuseColor = new Color3(0, 0.2, 0.3);
    cabinMat.emissiveColor = new Color3(0, 0.6, 0.8);
    this.cabinMesh = MeshBuilder.CreateBox("carCabin", { width: 2.5, height: 0.7, depth: 1.4 }, scene);
    this.cabinMesh.position.y = 1.25;
    this.cabinMesh.material = cabinMat;
    this.cabinMesh.parent = this.rootNode;

    // Wheels: 4 cylinders at corners
    const wheelMat = new StandardMaterial("wheelMat", scene);
    wheelMat.diffuseColor = new Color3(0.15, 0.15, 0.2);
    wheelMat.emissiveColor = new Color3(0, 0.1, 0.3);
    wheelMat.specularColor = new Color3(0.1, 0.1, 0.15);

    const wheelPositions: [number, number, number][] = [
      [1.8, 0.4, 0.8],   // front right
      [-1.8, 0.4, 0.8],  // front left
      [1.8, 0.4, -0.8],  // rear right
      [-1.8, 0.4, -0.8], // rear left
    ];

    for (let i = 0; i < 4; i++) {
      const wheel = MeshBuilder.CreateCylinder(`wheel${i}`, {
        diameter: 0.8,
        height: 0.4,
        tessellation: 12,
      }, scene);
      const [wx, wy, wz] = wheelPositions[i];
      wheel.position = new Vector3(wx, wy, wz);
      wheel.rotation.z = Math.PI / 2; // rotate to axle orientation
      wheel.material = wheelMat;
      wheel.parent = this.rootNode;
      this.wheelMeshes.push(wheel);
    }

    // Position root node at spawn
    this.rootNode.position = new Vector3(spawn.x, spawn.y, spawn.z);
    this.rootNode.rotation.y = this.state.yaw;
  }

  update(dt: number, input: CarPhysicsInput): void {
    if (dt <= 0 || dt > 0.5) return; // sanity clamp

    // Handle pending respawn
    if (this.respawnPending) {
      this.respawnTimer -= dt * 1000;
      if (this.respawnTimer <= 0) {
        this.respawnPending = false;
        this._doRespawn();
      }
      return;
    }

    const curPos = new Vector3(this.state.pos.x, this.state.pos.y, this.state.pos.z);

    // Manage boost energy
    const wantsBoost = input.boost && this._boostEnergy >= CarController.BOOST_MIN_ENERGY;
    const isBoosting = this.state.boostTimer > 0;

    if (isBoosting) {
      // Drain while boost effect is active
      this._boostEnergy = Math.max(0, this._boostEnergy - CarController.BOOST_DRAIN_RATE * dt);
    } else {
      // Regen when not boosting
      this._boostEnergy = Math.min(1, this._boostEnergy + CarController.BOOST_REGEN_RATE * dt);
    }

    // Only pass boost:true to physics if we have enough energy
    const effectiveInput = { ...input, boost: wantsBoost };

    // Get ground height
    const groundY = this.track.getGroundY(curPos.x, curPos.z);

    // Get wall response
    const wallResp = this.track.getWallResponse(curPos, this.state.lateralVel);
    const wallPush = wallResp ? { x: wallResp.push.x, z: wallResp.push.z } : null;
    const wallLateralVel = wallResp ? wallResp.newLateralVel : undefined;

    // Update physics
    const newState = updateCarPhysics(
      this.state,
      effectiveInput,
      dt,
      this.config,
      groundY,
      wallPush,
      wallLateralVel,
    );

    // Off-track detection
    const newPos = new Vector3(newState.pos.x, newState.pos.y, newState.pos.z);
    if (!this.track.isOnTrack(newPos)) {
      newState.offTrackTimer = (this.state.offTrackTimer || 0) + dt * 1000;
      if (newState.offTrackTimer >= this.config.respawnDelay) {
        // Trigger respawn
        this._scheduleRespawn();
        newState.offTrackTimer = 0;
      }
    } else {
      newState.offTrackTimer = 0;
    }

    this.state = newState;

    // Update mesh
    this.rootNode.position.x = this.state.pos.x;
    this.rootNode.position.y = this.state.pos.y;
    this.rootNode.position.z = this.state.pos.z;
    this.rootNode.rotation.y = this.state.yaw;

    // Animate wheels: rotate around axle based on speed
    const wheelRotSpeed = this.state.speed * dt * 2;
    for (const wheel of this.wheelMeshes) {
      wheel.rotation.y += wheelRotSpeed;
    }
  }

  private _scheduleRespawn(): void {
    this.respawnPending = true;
    this.respawnTimer = this.config.respawnDelay;
    // Show respawn message via DOM
    const msg = document.getElementById("respawn-msg");
    if (msg) msg.style.display = "block";
  }

  private _doRespawn(): void {
    this.respawn();
    const msg = document.getElementById("respawn-msg");
    if (msg) msg.style.display = "none";
  }

  respawn(): void {
    const spawn = this.track.spawnPosition;
    this.state = {
      speed: 0,
      lateralVel: 0,
      verticalVel: 0,
      boostTimer: 0,
      offTrackTimer: 0,
      yaw: this.track.spawnYaw,
      pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    };
    this._boostEnergy = 1.0;
    this.rootNode.position = new Vector3(spawn.x, spawn.y, spawn.z);
    this.rootNode.rotation.y = this.state.yaw;
  }

  activateBoost(): void {
    if (this.state.boostTimer <= 0) {
      this.state.boostTimer = this.config.boostDuration;
    }
  }

  get position(): Vector3 {
    return new Vector3(this.state.pos.x, this.state.pos.y, this.state.pos.z);
  }

  get yaw(): number {
    return this.state.yaw;
  }

  get speed(): number {
    return this.state.speed;
  }

  get isBoosting(): boolean {
    return this.state.boostTimer > 0;
  }

  get boostEnergy(): number {
    return this._boostEnergy;
  }

  get isRespawning(): boolean {
    return this.respawnPending;
  }

  /** Expose body mesh for camera tracking */
  get mesh(): TransformNode {
    return this.rootNode;
  }
}
