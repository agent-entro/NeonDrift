import { WebSocket } from "ws";
import { pack, unpack } from "msgpackr";
import type {
  ClientMessage,
  ServerMessage,
  InputMessage,
  PlayerGameState,
} from "@neondrift/shared";
import {
  TICK_MS,
  TICK_RATE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RECONNECT_GRACE_MS as RECONNECT_GRACE_MS_DEFAULT,
  LOBBY_AUTO_START_MS,
} from "@neondrift/shared";

/** Operator-tunable reconnect grace period via env var; falls back to shared default (10s) */
const RECONNECT_GRACE_MS =
  parseInt(process.env["RECONNECT_GRACE_MS"] ?? "", 10) || RECONNECT_GRACE_MS_DEFAULT;
import { stepServerPhysics, type ServerCarState } from "./ServerCarPhysics.js";
import { createPlayerSession, type PlayerSession } from "./PlayerSession.js";

export type RoomPhase = "lobby" | "countdown" | "racing" | "finished";

/** Number of laps per race (time-based placeholder) */
const TOTAL_LAPS = 3;
/** Duration of each lap in ms (placeholder, 60s per lap) */
const LAP_DURATION_MS = 60_000;
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

    // Initialize lap start times for all players
    for (const session of this.players.values()) {
      if (!session.isSpectator) {
        session.lapStartTime = this.raceStartTime;
        session.lap = 0;
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

  private checkLaps(session: PlayerSession, now: number): void {
    if (session.finished) return;

    const elapsed = now - this.raceStartTime;
    const expectedLap = Math.floor(elapsed / LAP_DURATION_MS);
    const completedLaps = Math.min(expectedLap, TOTAL_LAPS);

    if (completedLaps > session.lap) {
      // Player completed one or more laps
      while (session.lap < completedLaps && session.lap < TOTAL_LAPS) {
        const lapTime = now - session.lapStartTime;
        session.lapTimes.push(lapTime);
        session.lapStartTime = now;
        session.lap++;

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

        // Check if finished (completed all laps)
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
          break;
        }
      }
    }
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
    const players: PlayerGameState[] = [];

    for (const session of this.players.values()) {
      if (session.isSpectator) continue;

      const state = session.carState;
      const vel = this.computeVelFromState(state);

      players.push({
        id: session.playerId,
        pos: { x: state.x, y: state.y, z: state.z },
        rot: yawToQuat(state.yaw),
        vel,
        lap: session.lap,
        powerup: session.activePowerup,
        finished: session.finished,
        finish_time_ms: session.finishTimeMs,
      });
    }

    const msg: ServerMessage = {
      type: "state",
      tick: this.tick,
      server_time: now,
      players,
      powerups: [], // No powerup spawns in Phase 1B
    };

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
