import type { WebSocket } from "ws";
import type { PowerupKind } from "@neondrift/shared";
import { createDefaultCarState, type ServerCarState, type ServerCarInput } from "./ServerCarPhysics.js";

export interface PlayerSession {
  playerId: string;
  displayName: string;
  slot: number;
  ws: WebSocket | null;
  disconnectedAt: number | null;
  isSpectator: boolean;
  carState: ServerCarState;
  /** Current lap (0-indexed: 0 = first lap in progress) */
  lap: number;
  lapStartTime: number;
  /** Completed lap times in ms */
  lapTimes: number[];
  finished: boolean;
  finishTimeMs: number | null;
  activePowerup: PowerupKind | null;
  powerupExpiresAt: number | null;
  lastInput: ServerCarInput;
  lastInputTick: number;
  isReady: boolean;
  // ── Position-based lap detection ─────────────────────────────────────────────
  /** Nearest track waypoint index this tick (0–RENDERED_TRACK_WAYPOINT_COUNT-1) */
  waypointIdx: number;
  /** Nearest track waypoint index last tick — needed to detect the wrap-around */
  prevWaypointIdx: number;
  /** True once the player has driven past the start zone so we don't count the
   *  initial start-line crossing as a lap completion. */
  hasLeftStart: boolean;
}

const ZERO_INPUT: ServerCarInput = {
  steering: 0,
  throttle: 0,
  brake: false,
  boost: false,
};

/**
 * Spawn positions staggered by slot so cars don't overlap at race start.
 * Slots are spread along the Z-axis.
 */
function slotToSpawnPos(slot: number): { x: number; y: number; z: number; yaw: number } {
  const column = slot % 2;
  const row = Math.floor(slot / 2);
  return {
    x: column === 0 ? -2.5 : 2.5,
    y: 1.0,   // GROUND_Y (0.5) + half-height (0.5)
    z: -row * 6,
    yaw: 0,
  };
}

export function createPlayerSession(
  playerId: string,
  displayName: string,
  slot: number,
  ws: WebSocket,
  isSpectator: boolean,
): PlayerSession {
  const spawn = slotToSpawnPos(slot);
  return {
    playerId,
    displayName,
    slot,
    ws,
    disconnectedAt: null,
    isSpectator,
    carState: createDefaultCarState(spawn.x, spawn.y, spawn.z, spawn.yaw),
    lap: 0,
    lapStartTime: 0,
    lapTimes: [],
    finished: false,
    finishTimeMs: null,
    activePowerup: null,
    powerupExpiresAt: null,
    lastInput: { ...ZERO_INPUT },
    lastInputTick: 0,
    isReady: false,
    waypointIdx: 0,
    prevWaypointIdx: 0,
    hasLeftStart: false,
  };
}
