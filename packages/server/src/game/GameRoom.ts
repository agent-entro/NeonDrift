import { WebSocket } from "ws";
import { pack, unpack } from "msgpackr";
import type {
  ClientMessage,
  ServerMessage,
  InputMessage,
  PlayerGameState,
  PlayerPositionDelta,
} from "@neondrift/shared";
import {
  TICK_MS,
  TICK_RATE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RECONNECT_GRACE_MS as RECONNECT_GRACE_MS_DEFAULT,
  LOBBY_AUTO_START_MS,
  computeNearestWaypointIdx,
  RENDERED_TRACK_WAYPOINT_COUNT,
} from "@neondrift/shared";

/** Operator-tunable reconnect grace period via env var; falls back to shared default (10s) */
const RECONNECT_GRACE_MS =
  parseInt(process.env["RECONNECT_GRACE_MS"] ?? "", 10) || RECONNECT_GRACE_MS_DEFAULT;
import { stepServerPhysics, type ServerCarState } from "./ServerCarPhysics.js";
import { createPlayerSession, type PlayerSession } from "./PlayerSession.js";

export type RoomPhase = "lobby" | "countdown" | "racing" | "finished";

// ─── Delta compression constants ─────────────────────────────────────────────
/** Send a full snapshot every N ticks (20Hz × 3s = 60 ticks) */
const FULL_SYNC_INTERVAL = 60;
/** Position change threshold below which a player is omitted from the delta (meters) */
const DELTA_POS_THRESHOLD = 0.005; // 0.5cm
/** Yaw change threshold below which yaw is omitted (radians) */
const DELTA_YAW_THRESHOLD = 0.001;
/** Quantization: store positions as int16 at 1cm resolution */
const POS_QUANTIZE = 100;
/** Quantization: store yaw as int16 at 1/1000 radian resolution */
const YAW_QUANTIZE = 1000;
/** Quantization: store speed as int16 at 1/10 m/s resolution */
const SPEED_QUANTIZE = 10;
/** int16 range */
const INT16_MIN = -32768;
const INT16_MAX = 32767;

/** Baseline state used to compute position deltas */
interface PlayerBaseline {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  lap: number;
}

/** Number of laps per race */
const TOTAL_LAPS = 3;
/** How long after finishing before the room is cleaned up */
const FINISH_CLEANUP_DELAY_MS = 30_000;
/** Countdown duration in seconds */
const COUNTDOWN_SECONDS = 3;

/**
 * Convert a yaw angle (radians) to a quaternion rotating around the Y-axis.
 */
function yawToQuat(yaw: number): { x: number; y: number; z: number; w: number } {
  const half = yaw / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export class GameRoom {
  readonly roomId: string;
  readonly trackId: string;
  readonly hostPlayerId: string;
  readonly maxPlayers: number;

  private phase: RoomPhase = "lobby";
  private players: Map<string, PlayerSession> = new Map();
  private spectators: Set<WebSocket> = new Set();
  private tick: number = 0;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private raceStartTime: number = 0;
  private raceId: string = "";
  private onEmpty: () => void;
  private finishOrder: string[] = [];
  /** Delta baseline: last position broadcast as a full snapshot per player */
  private deltaBaselines: Map<string, PlayerBaseline> = new Map();
  /** Tick number of last full sync */
  private baselineTick: number = 0;

  constructor(
    roomId: string,
    trackId: string,
    hostPlayerId: string,
    maxPlayers: number,
    onEmpty: () => void,
  ) {
    this.roomId = roomId;
    this.trackId = trackId;
    this.hostPlayerId = hostPlayerId;
    this.maxPlayers = Math.min(maxPlayers, MAX_PLAYERS);
    this.onEmpty = onEmpty;
    this.raceId = `race-${roomId}-${Date.now()}`;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  addPlayer(
    ws: WebSocket,
    playerId: string,
    displayName: string,
    slot: number,
    isSpectator: boolean,
  ): void {
    if (isSpectator) {
      this.spectators.add(ws);
      this.sendWelcome(ws, playerId);
      this.sendRoomState(ws);
      return;
    }

    if (this.players.size >= this.maxPlayers) {
      this.send(ws, { type: "error", code: "room_full", message: "Room is full" });
      return;
    }

    // Reuse existing slot if player re-joins in lobby
    const existing = this.players.get(playerId);
    if (existing) {
      existing.ws = ws;
      existing.disconnectedAt = null;
      this.sendWelcome(ws, playerId);
      this.sendRoomState(ws);
      return;
    }

    const session = createPlayerSession(playerId, displayName, slot, ws, false);
    this.players.set(playerId, session);

    this.sendWelcome(ws, playerId);
    this.broadcastRoomState();
  }

  handleDisconnect(ws: WebSocket): void {
    // Check spectators
    if (this.spectators.has(ws)) {
      this.spectators.delete(ws);
      return;
    }

    // Find which player owns this socket
    for (const [, session] of this.players) {
      if (session.ws === ws) {
        session.ws = null;
        session.disconnectedAt = Date.now();
        console.log(`[room:${this.roomId}] player ${session.playerId} disconnected`);

        if (this.phase === "lobby") {
          // Remove from lobby immediately
          this.players.delete(session.playerId);
          this.broadcastRoomState();
          if (this.players.size === 0) {
            this.onEmpty();
          }
        }
        return;
      }
    }
  }

  handleReconnect(ws: WebSocket, playerId: string): void {
    const session = this.players.get(playerId);
    if (!session) return;

    const now = Date.now();
    const elapsed = session.disconnectedAt ? now - session.disconnectedAt : 0;

    if (elapsed > RECONNECT_GRACE_MS) {
      this.send(ws, {
        type: "error",
        code: "reconnect_expired",
        message: "Reconnect window has expired",
      });
      return;
    }

    session.ws = ws;
    session.disconnectedAt = null;
    console.log(`[room:${this.roomId}] player ${playerId} reconnected`);

    this.sendWelcome(ws, playerId);
    if (this.phase === "lobby") {
      this.sendRoomState(ws);
    } else {
      // Send current race state so the client can re-sync
      this.sendRoomState(ws);
    }
  }

  handleMessage(playerId: string, msg: ClientMessage): void {
    switch (msg.type) {
      case "ready":
        this.setReady(playerId, msg.is_ready);
        break;
      case "input":
        this.handleInput(playerId, msg);
        break;
      case "chat":
        // TODO: relay chat to room
        break;
      case "leave":
        this.handleLeave(playerId);
        break;
      default:
        break;
    }
  }

  setReady(playerId: string, isReady: boolean): void {
    const session = this.players.get(playerId);
    if (!session || this.phase !== "lobby") return;

    session.isReady = isReady;
    this.broadcastRoomState();
    this.checkAutoStart();
  }

  getPhase(): RoomPhase {
    return this.phase;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  /**
   * Exposes the player session map for unit-test assertions only.
   * Do not use this in application code.
   */
  getPlayersForTest(): Map<string, PlayerSession> {
    return this.players;
  }

  cleanup(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    // Close all connections
    for (const session of this.players.values()) {
      session.ws?.close();
    }
    for (const ws of this.spectators) {
      ws.close();
    }
    this.players.clear();
    this.spectators.clear();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private handleInput(playerId: string, msg: InputMessage): void {
    const session = this.players.get(playerId);
    if (!session || this.phase !== "racing") return;

    session.lastInput = {
      steering: Math.max(-1, Math.min(1, msg.steering)),
      throttle: Math.max(0, Math.min(1, msg.throttle)),
      brake: msg.brake,
      boost: msg.boost,
    };
    session.lastInputTick = msg.tick;
  }

  private handleLeave(playerId: string): void {
    const session = this.players.get(playerId);
    if (!session) return;

    session.ws?.close();
    this.players.delete(playerId);
    this.broadcastRoomState();

    if (this.players.size === 0) {
      this.onEmpty();
    }
  }

  private checkAutoStart(): void {
    if (this.phase !== "lobby") return;

    const activePlayers = [...this.players.values()].filter((s) => !s.isSpectator);
    const readyCount = activePlayers.filter((s) => s.isReady).length;

    // All players ready and at least MIN_PLAYERS
    if (activePlayers.length >= MIN_PLAYERS && readyCount === activePlayers.length) {
      this.startCountdown();
    }
  }

  private startCountdown(): void {
    if (this.phase !== "lobby") return;
    if (this.countdownTimer) return; // already counting

    this.phase = "countdown";
    console.log(`[room:${this.roomId}] countdown starting`);

    let remaining = COUNTDOWN_SECONDS;

    const tick = (): void => {
      this.broadcast({ type: "countdown", seconds: remaining });
      remaining--;
      if (remaining > 0) {
        this.countdownTimer = setTimeout(tick, 1000);
      } else {
        this.countdownTimer = setTimeout(() => {
          this.countdownTimer = null;
          this.startRace();
        }, 1000);
      }
    };

    tick();
  }

  private cancelCountdown(): void {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.phase = "lobby";
  }

  private startRace(): void {
    this.phase = "racing";
    this.raceStartTime = Date.now();
    this.tick = 0;
    this.finishOrder = [];
    this.deltaBaselines.clear();
    this.baselineTick = 0;

    // Initialize lap tracking state for all players
    for (const session of this.players.values()) {
      if (!session.isSpectator) {
        session.lapStartTime = this.raceStartTime;
        session.lap = 0;
        session.lapTimes = [];
        session.finished = false;
        session.finishTimeMs = null;
        session.waypointIdx = 0;
        session.prevWaypointIdx = 0;
        session.hasLeftStart = false;
      }
    }

    this.broadcast({
      type: "race_start",
      race_id: this.raceId,
      tick: this.tick,
      server_time: this.raceStartTime,
    });

    console.log(`[room:${this.roomId}] race started`);

    this.tickInterval = setInterval(() => this.doTick(), TICK_MS);
  }

  private doTick(): void {
    const now = Date.now();

    // 1. Check reconnect timeouts
    this.checkReconnectTimeouts(now);

    // 2. Step physics for each player
    for (const session of this.players.values()) {
      if (session.isSpectator || session.finished) continue;

      const isDisconnected = session.ws === null;
      const disconnectedElapsed = isDisconnected && session.disconnectedAt
        ? now - session.disconnectedAt
        : 0;

      // Step with zero input for disconnected players within grace window
      if (isDisconnected) {
        if (disconnectedElapsed <= RECONNECT_GRACE_MS) {
          // Drive straight (zero input) during grace period
          session.carState = stepServerPhysics(
            session.carState,
            { steering: 0, throttle: 0, brake: false, boost: false },
            TICK_MS,
          );
        }
        // After grace period: stop updating (car stays in place)
      } else {
        session.carState = stepServerPhysics(session.carState, session.lastInput, TICK_MS);
      }

      // 6. Check time-based lap completion
      this.checkLaps(session, now);
    }

    // 3. Broadcast state
    this.broadcastState(now);

    this.tick++;

    // 7. Check if all non-disconnected players finished
    this.checkRaceFinish(now);
  }

  /**
   * Position-based lap detection — mirrors the client-side LapTimer logic.
   *
   * Each physics tick we compute the player's nearest track waypoint (0–27).
   * A lap completes when the car transitions from the "near-end" zone (idx ≥ 90%
   * of total) to the "near-start" zone (idx < 10% of total), provided the car
   * has already driven far enough past the start line to exclude the initial
   * crossing (hasLeftStart flag).
   *
   * This replaces the broken time-based system where all players advanced laps
   * simultaneously, making race positions permanently tied.
   */
  private checkLaps(session: PlayerSession, now: number): void {
    if (session.finished) return;

    const total = RENDERED_TRACK_WAYPOINT_COUNT; // 28
    const idx = computeNearestWaypointIdx(session.carState.x, session.carState.z);

    // Mark as having left the start zone (>15% of the track away from start)
    if (!session.hasLeftStart && idx > Math.floor(total * 0.15)) {
      session.hasLeftStart = true;
    }

    // Detect wrap-around: was near the end of the track, now near the beginning
    const wasNearEnd = session.prevWaypointIdx >= Math.floor(total * 0.9);
    const isNearStart = idx < Math.floor(total * 0.1);

    if (wasNearEnd && isNearStart && session.hasLeftStart) {
      const lapTime = now - session.lapStartTime;
      session.lapTimes.push(lapTime);
      session.lapStartTime = now;
      session.lap++;
      session.hasLeftStart = false; // require leaving start zone again next lap

      this.broadcast({
        type: "event",
        kind: "lap_complete",
        player_id: session.playerId,
        data: {
          lap: session.lap,
          lap_time_ms: lapTime,
        },
      });

      console.log(
        `[room:${this.roomId}] player ${session.playerId} completed lap ${session.lap}`,
      );

      if (session.lap >= TOTAL_LAPS) {
        session.finished = true;
        session.finishTimeMs = now - this.raceStartTime;
        this.finishOrder.push(session.playerId);

        this.broadcast({
          type: "event",
          kind: "player_finish",
          player_id: session.playerId,
          data: {
            position: this.finishOrder.length,
            total_time_ms: session.finishTimeMs,
          },
        });

        console.log(
          `[room:${this.roomId}] player ${session.playerId} finished in position ${this.finishOrder.length}`,
        );
      }
    }

    session.prevWaypointIdx = session.waypointIdx;
    session.waypointIdx = idx;
  }

  private checkReconnectTimeouts(now: number): void {
    for (const [playerId, session] of this.players) {
      if (session.ws !== null || session.disconnectedAt === null) continue;

      const elapsed = now - session.disconnectedAt;
      if (elapsed > RECONNECT_GRACE_MS) {
        // Grace period expired — mark as finished (DNF) if not already
        if (!session.finished) {
          session.finished = true;
          session.finishTimeMs = null; // DNF
          console.log(`[room:${this.roomId}] player ${playerId} timed out (DNF)`);
        }
      }
    }
  }

  private checkRaceFinish(now: number): void {
    if (this.phase !== "racing") return;

    const activePlayers = [...this.players.values()].filter(
      (s) => !s.isSpectator,
    );

    if (activePlayers.length === 0) return;

    const allDone = activePlayers.every((s) => s.finished);
    if (!allDone) return;

    this.phase = "finished";

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    console.log(`[room:${this.roomId}] race finished`);

    // Build results
    const results = activePlayers
      .filter((s) => s.finishTimeMs !== null)
      .sort((a, b) => (a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity))
      .map((s, index) => ({
        player_id: s.playerId,
        display_name: s.displayName,
        position: index + 1,
        total_time_ms: s.finishTimeMs ?? 0,
        best_lap_ms: s.lapTimes.length > 0 ? Math.min(...s.lapTimes) : 0,
        xp_earned: this.calcXp(index + 1),
      }));

    this.broadcast({
      type: "race_finish",
      race_id: this.raceId,
      results,
    });

    // Schedule cleanup
    setTimeout(() => {
      this.cleanup();
      this.onEmpty();
    }, FINISH_CLEANUP_DELAY_MS);
  }

  private calcXp(position: number): number {
    const bonuses: Record<number, number> = { 1: 100, 2: 70, 3: 50 };
    return 50 + (bonuses[position] ?? 20);
  }

  private broadcastState(now: number): void {
    const isFullSync = this.tick % FULL_SYNC_INTERVAL === 0;
    const fullPlayers: PlayerGameState[] = [];
    const deltaPlayers: PlayerPositionDelta[] = [];
    const connectedCount = [...this.players.values()].filter((s) => s.ws !== null).length;
    if (this.tick === 0) {
      console.log(`[room:${this.roomId}] tick=0 full-sync: ${this.players.size} players (${connectedCount} connected)`);
    }

    for (const session of this.players.values()) {
      if (session.isSpectator) continue;

      const state = session.carState;
      const vel = this.computeVelFromState(state);
      const baseline = this.deltaBaselines.get(session.playerId);

      const fullState: PlayerGameState = {
        id: session.playerId,
        pos: { x: state.x, y: state.y, z: state.z },
        rot: yawToQuat(state.yaw),
        vel,
        lap: session.lap,
        powerup: session.activePowerup,
        finished: session.finished,
        finish_time_ms: session.finishTimeMs,
      };

      // lapChanged must trigger a full-snapshot, NOT a delta: PlayerPositionDelta
      // has no lap field, so a delta-only tick would silently drop the new lap
      // count and leave both clients showing stale (and equal) lap numbers until
      // the next scheduled full-sync 3 seconds later — the root cause of the
      // "both cars think they are in 1st" desync.
      const lapChanged = baseline ? fullState.lap !== baseline.lap : false;

      if (isFullSync || !baseline || session.finished || lapChanged) {
        // Full snapshot: include complete state and update baseline
        fullPlayers.push(fullState);
        this.deltaBaselines.set(session.playerId, {
          x: state.x,
          y: state.y,
          z: state.z,
          yaw: state.yaw,
          speed: state.speed,
          lap: session.lap,
        });
      } else {
        // Delta tick: check how much the player moved
        const dx = state.x - baseline.x;
        const dy = state.y - baseline.y;
        const dz = state.z - baseline.z;
        const dyaw = state.yaw - baseline.yaw;
        const dspeed = state.speed - baseline.speed;

        const posMoved =
          Math.abs(dx) > DELTA_POS_THRESHOLD ||
          Math.abs(dy) > DELTA_POS_THRESHOLD ||
          Math.abs(dz) > DELTA_POS_THRESHOLD;
        const yawChanged = Math.abs(dyaw) > DELTA_YAW_THRESHOLD;

        if (posMoved || yawChanged || fullState.powerup !== null) {
          // Quantize to int16 (clamped)
          const clamp16 = (v: number): number =>
            Math.round(Math.max(INT16_MIN, Math.min(INT16_MAX, v)));

          deltaPlayers.push({
            id: session.playerId,
            dx: clamp16(dx * POS_QUANTIZE),
            dy: clamp16(dy * POS_QUANTIZE),
            dz: clamp16(dz * POS_QUANTIZE),
            dyaw: clamp16(dyaw * YAW_QUANTIZE),
            speed: clamp16(state.speed * SPEED_QUANTIZE),
          });

          // DO NOT advance the baseline here. Deltas are always computed
          // relative to the last FULL-SYNC baseline, not the previous delta.
          // The client's baselines map is only updated on full-sync ticks, so
          // both sides must use the same fixed reference. Advancing the baseline
          // here while the client uses a fixed one causes error to accumulate
          // at ~speed×TICK_MS per tick (≈1.5 m/tick at 35 m/s → ~90 m after 3s).

          // Rebase when accumulated delta would overflow int16 (>262m from baseline)
          const accDx = Math.abs(dx) * POS_QUANTIZE;
          const accDz = Math.abs(dz) * POS_QUANTIZE;
          if (accDx > INT16_MAX * 0.8 || accDz > INT16_MAX * 0.8) {
            // Clear baseline → player falls into the !baseline branch next tick
            // and is sent as a full snapshot, resetting both sides.
            this.deltaBaselines.delete(session.playerId);
          }
        }
        // If not moved at all: omit this player from the delta; baseline is
        // unchanged so the next active tick computes the correct cumulative diff.
      }
    }

    if (isFullSync) {
      this.baselineTick = this.tick;
    }

    const msg: ServerMessage = {
      type: "state",
      tick: this.tick,
      server_time: now,
      players: fullPlayers,
      deltas: deltaPlayers,
      powerups: [],
      is_full_sync: isFullSync,
      baseline_tick: this.baselineTick,
    };

    // Diagnostic: log first 5 ticks so we can verify all players are included
    if (this.tick < 5) {
      const recipients = [...this.players.values()].filter((s) => s.ws?.readyState === 1 /* OPEN */).length;
      console.log(
        `[room:${this.roomId}] tick=${this.tick} full=${fullPlayers.length} deltas=${deltaPlayers.length} recipients=${recipients}`,
      );
    }

    this.broadcast(msg);
  }

  private broadcastRoomState(): void {
    const playerList = [...this.players.values()]
      .filter((s) => !s.isSpectator)
      .map((s) => ({
        player_id: s.playerId,
        display_name: s.displayName,
        slot: s.slot,
        is_ready: s.isReady,
      }));

    const msg: ServerMessage = {
      type: "room_state",
      room_id: this.roomId,
      status: this.phase === "lobby" ? "lobby" : this.phase === "finished" ? "finished" : "racing",
      track_id: this.trackId,
      players: playerList,
      host_player_id: this.hostPlayerId,
    };

    this.broadcast(msg);
  }

  private sendRoomState(ws: WebSocket): void {
    const playerList = [...this.players.values()]
      .filter((s) => !s.isSpectator)
      .map((s) => ({
        player_id: s.playerId,
        display_name: s.displayName,
        slot: s.slot,
        is_ready: s.isReady,
      }));

    const msg: ServerMessage = {
      type: "room_state",
      room_id: this.roomId,
      status: this.phase === "lobby" ? "lobby" : this.phase === "finished" ? "finished" : "racing",
      track_id: this.trackId,
      players: playerList,
      host_player_id: this.hostPlayerId,
    };

    this.send(ws, msg);
  }

  private sendWelcome(ws: WebSocket, playerId: string): void {
    this.send(ws, {
      type: "welcome",
      player_id: playerId,
      room_id: this.roomId,
      tick: this.tick,
      server_time: Date.now(),
    });
  }

  private broadcast(msg: ServerMessage): void {
    const encoded = pack(msg);

    for (const session of this.players.values()) {
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(encoded);
      }
    }

    for (const ws of this.spectators) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoded);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(pack(msg));
    }
  }

  private computeVelFromState(state: ServerCarState): { x: number; y: number; z: number } {
    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);

    return {
      x: forwardX * state.speed + rightX * state.lateralVel,
      y: state.verticalVel,
      z: forwardZ * state.speed + rightZ * state.lateralVel,
    };
  }
}
