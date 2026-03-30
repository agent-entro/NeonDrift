import type { PlayerGameState, PowerupSpawn, RoomStatus } from "./types.js";

// ─── Message type discriminants ──────────────────────────────────────────────

export type ClientMessageType =
  | "join"
  | "leave"
  | "ready"
  | "input"
  | "chat";

export type ServerMessageType =
  | "welcome"
  | "room_state"
  | "state"
  | "event"
  | "error"
  | "countdown"
  | "race_start"
  | "race_finish";

// ─── Client → Server messages ────────────────────────────────────────────────

export interface JoinMessage {
  type: "join";
  room_id: string;
  player_id: string;
  session_token: string;
  /** true if joining as spectator */
  spectate?: boolean;
}

export interface LeaveMessage {
  type: "leave";
}

export interface ReadyMessage {
  type: "ready";
  is_ready: boolean;
}

/**
 * Input snapshot sent every tick from client.
 * Values are clamped: steering ∈ [-1,1], throttle ∈ [0,1]
 */
export interface InputMessage {
  type: "input";
  /** Server tick this input corresponds to */
  tick: number;
  steering: number;
  throttle: number;
  brake: boolean;
  boost: boolean;
}

export interface ChatMessage {
  type: "chat";
  text: string;
}

export type ClientMessage =
  | JoinMessage
  | LeaveMessage
  | ReadyMessage
  | InputMessage
  | ChatMessage;

// ─── Server → Client messages ────────────────────────────────────────────────

export interface WelcomeMessage {
  type: "welcome";
  player_id: string;
  room_id: string;
  tick: number;
  /** Server timestamp (ms since epoch) */
  server_time: number;
}

/** Full room state snapshot (sent on join, on lobby changes) */
export interface RoomStateMessage {
  type: "room_state";
  room_id: string;
  status: RoomStatus;
  track_id: string;
  players: Array<{
    player_id: string;
    display_name: string;
    slot: number;
    is_ready: boolean;
  }>;
  host_player_id: string;
}

/** Authoritative game state tick (20Hz during race) */
export interface StateMessage {
  type: "state";
  tick: number;
  /** Server timestamp for lag compensation */
  server_time: number;
  players: PlayerGameState[];
  powerups: PowerupSpawn[];
}

export type GameEventKind =
  | "powerup_used"
  | "lap_complete"
  | "respawn"
  | "player_finish"
  | "player_join"
  | "player_leave";

export interface EventMessage {
  type: "event";
  kind: GameEventKind;
  player_id: string;
  data: Record<string, unknown>;
}

export interface CountdownMessage {
  type: "countdown";
  /** Seconds remaining: 3, 2, 1 */
  seconds: number;
}

export interface RaceStartMessage {
  type: "race_start";
  race_id: string;
  tick: number;
  server_time: number;
}

export interface RaceFinishMessage {
  type: "race_finish";
  race_id: string;
  results: Array<{
    player_id: string;
    display_name: string;
    position: number;
    total_time_ms: number;
    best_lap_ms: number;
    xp_earned: number;
  }>;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage =
  | WelcomeMessage
  | RoomStateMessage
  | StateMessage
  | EventMessage
  | CountdownMessage
  | RaceStartMessage
  | RaceFinishMessage
  | ErrorMessage;
