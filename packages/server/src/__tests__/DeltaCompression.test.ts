/**
 * Tests for delta-compressed state broadcast in GameRoom.
 * Verifies that the server sends full snapshots periodically
 * and position-only deltas between them.
 *
 * Timing note: countdown takes exactly 3000ms (3 × 1s timeouts).
 * Race starts at t=3000ms; first tick fires at t=3050ms.
 * We advance 3000ms to start the race with 0 ticks, then add precise ms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameRoom } from "../game/GameRoom.js";
import { unpack } from "msgpackr";
import type { ServerMessage, StateMessage } from "@neondrift/shared";

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

class MockWebSocket {
  readyState = 1; // OPEN
  messages: ServerMessage[] = [];

  send(data: Buffer | Uint8Array): void {
    const msg = unpack(data) as ServerMessage;
    this.messages.push(msg);
  }

  close(): void {
    this.readyState = 3;
  }

  stateMsgs(): StateMessage[] {
    return this.messages.filter((m): m is StateMessage => m.type === "state");
  }
}

function createRoom(): GameRoom {
  return new GameRoom("test-delta", "city-canyon", "host-1", 8, () => {});
}

function makeMockWs(): MockWebSocket {
  return new MockWebSocket();
}

/** Advance timers through the 3-second countdown (no ticks fired yet). */
function startRace(room: GameRoom, ws1: MockWebSocket, ws2: MockWebSocket): void {
  room.addPlayer(ws1 as any, "p1", "Alice", 0, false);
  room.addPlayer(ws2 as any, "p2", "Bob", 1, false);
  room.setReady("p1", true);
  room.setReady("p2", true);
  // Countdown: 3 × 1000ms setTimeouts → race starts at exactly 3000ms
  vi.advanceTimersByTime(3000);
  expect(room.getPhase()).toBe("racing");
  // Clear any messages generated during countdown (room_state, countdowns)
  ws1.messages = ws1.messages.filter((m) => m.type !== "countdown" && m.type !== "room_state" && m.type !== "welcome" && m.type !== "race_start");
  ws2.messages = ws2.messages.filter((m) => m.type !== "countdown" && m.type !== "room_state" && m.type !== "welcome" && m.type !== "race_start");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Delta-compressed state broadcast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it("first state broadcast (tick 0) is a full sync", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2);

    // First tick fires at 3050ms (race started at 3000ms, interval=50ms)
    vi.advanceTimersByTime(50);

    const states = ws1.stateMsgs();
    expect(states.length).toBe(1);

    const first = states[0];
    expect(first.tick).toBe(0);
    // Tick 0 → 0 % 60 === 0 → full sync
    expect(first.is_full_sync).toBe(true);
    expect(first.players.length).toBeGreaterThan(0);

    room.cleanup();
  });

  it("StateMessage includes baseline_tick field", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2);
    vi.advanceTimersByTime(50);

    const states = ws1.stateMsgs();
    expect(states.length).toBe(1);
    expect(typeof states[0].baseline_tick).toBe("number");
    expect(states[0].baseline_tick).toBe(0);

    room.cleanup();
  });

  it("StateMessage includes deltas array", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2);

    vi.advanceTimersByTime(250); // 5 ticks

    const states = ws1.stateMsgs();
    expect(states.length).toBe(5);

    for (const s of states) {
      expect(Array.isArray(s.deltas)).toBe(true);
    }

    room.cleanup();
  });

  it("non-full-sync ticks have is_full_sync=false", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2);

    // Advance 5 ticks (ticks 0-4)
    vi.advanceTimersByTime(250);

    const states = ws1.stateMsgs();
    expect(states.length).toBe(5);

    // Tick 0 → full sync
    expect(states[0].is_full_sync).toBe(true);
    // Ticks 1-4 → delta ticks
    for (const s of states.slice(1)) {
      expect(s.is_full_sync).toBe(false);
    }

    room.cleanup();
  });

  it("tick 60 triggers another full sync", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2);

    // Advance 61 ticks (ticks 0-60)
    vi.advanceTimersByTime(61 * 50);

    const states = ws1.stateMsgs();
    expect(states.length).toBe(61);

    const tick60State = states[60];
    expect(tick60State.tick).toBe(60);
    expect(tick60State.is_full_sync).toBe(true);
    expect(tick60State.players.length).toBeGreaterThan(0);

    room.cleanup();
  });

  it("delta entries have quantized integer fields within int16 range", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2); // clears messages, race is started

    // Now in racing phase — send throttle input so players move
    room.handleMessage("p1", {
      type: "input", tick: 0, steering: 0, throttle: 1, brake: false, boost: false,
    });
    room.handleMessage("p2", {
      type: "input", tick: 0, steering: 0, throttle: 1, brake: false, boost: false,
    });

    // Tick 0 (full sync) + 4 more ticks (delta) with throttle applied
    vi.advanceTimersByTime(250);

    const states = ws1.stateMsgs();
    // There should be delta ticks with movement after tick 0
    const deltaTicks = states.filter((s) => !s.is_full_sync && s.deltas.length > 0);

    expect(deltaTicks.length).toBeGreaterThan(0);

    const delta = deltaTicks[0].deltas[0];
    // Fields must be integers in int16 range
    expect(Number.isInteger(delta.dx)).toBe(true);
    expect(Number.isInteger(delta.dy)).toBe(true);
    expect(Number.isInteger(delta.dz)).toBe(true);
    expect(Number.isInteger(delta.dyaw)).toBe(true);
    expect(Number.isInteger(delta.speed)).toBe(true);
    expect(delta.dx).toBeGreaterThanOrEqual(-32768);
    expect(delta.dx).toBeLessThanOrEqual(32767);

    room.cleanup();
  });

  it("idle players (no input) are omitted from delta ticks after first full sync", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2);

    // Tick 0: full sync — players included regardless of movement
    vi.advanceTimersByTime(50);
    // Tick 1: delta — no movement since spawn, players should be omitted
    vi.advanceTimersByTime(50);

    const states = ws1.stateMsgs();
    expect(states.length).toBe(2);

    const deltaTick = states[1];
    expect(deltaTick.is_full_sync).toBe(false);
    // Players who haven't moved are omitted from both full and delta lists
    expect(deltaTick.players.length).toBe(0);
    expect(deltaTick.deltas.length).toBe(0);

    room.cleanup();
  });

  it("baseline_tick tracks the most recent full sync tick number", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2);

    // Advance to tick 60 (second full sync)
    vi.advanceTimersByTime(61 * 50);

    const states = ws1.stateMsgs();
    const fullSyncs = states.filter((s) => s.is_full_sync);
    expect(fullSyncs.length).toBe(2); // ticks 0 and 60

    expect(fullSyncs[0].baseline_tick).toBe(0);
    expect(fullSyncs[1].baseline_tick).toBe(60);

    // Delta ticks between the two full syncs reference tick 0 as baseline
    const deltaBetween = states.filter(
      (s) => !s.is_full_sync && s.tick > 0 && s.tick < 60,
    );
    for (const d of deltaBetween) {
      expect(d.baseline_tick).toBe(0);
    }

    room.cleanup();
  });

  it("race_start resets baseline so tick 0 of new race is a full sync", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2);

    // Tick 0 should always be a full sync (baseline_tick = 0)
    vi.advanceTimersByTime(50);

    const states = ws1.stateMsgs();
    expect(states[0].is_full_sync).toBe(true);
    expect(states[0].tick).toBe(0);
    expect(states[0].baseline_tick).toBe(0);

    room.cleanup();
  });

  /**
   * Regression test for the "ghost car teleports to infinity" bug.
   *
   * Root cause: The server computed deltas relative to the LAST FULL SYNC
   * position (baseline never advanced on delta ticks), but the client applied
   * each delta on top of the LAST RECEIVED position (baseline advanced each
   * tick). This caused ghost cars to diverge exponentially from real positions.
   *
   * Directly testable symptom: each delta value from the server must represent
   * a SINGLE TICK of movement (≤ top_speed × TICK_MS), never the cumulative
   * displacement from the last full sync (which grows every tick).
   *
   * At top speed 35 m/s × 50 ms = 1.75 m = 175 quantized units (int16 @ 1cm).
   * Before the fix: dz at tick N = N × per_tick_velocity → 10th tick ≈ 10×
   * larger than 1st, easily exceeding MAX_SINGLE_TICK_DZ.
   */
  it("delta baselines advance each tick so client reconstruction stays accurate", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    startRace(room, ws1, ws2);

    // Give both players forward throttle so they move every tick
    room.handleMessage("p1", {
      type: "input", tick: 0, steering: 0, throttle: 1, brake: false, boost: false,
    });
    room.handleMessage("p2", {
      type: "input", tick: 0, steering: 0, throttle: 1, brake: false, boost: false,
    });

    // Run tick 0 (full sync) + 30 delta ticks (enough for car to approach top speed)
    vi.advanceTimersByTime(31 * 50); // 31 × 50ms = 1.55 s

    const states = ws1.stateMsgs();
    expect(states.length).toBe(31);

    // ── Check: every server delta is bounded by one tick's max displacement ───
    // top_speed = 35 m/s; TICK_MS = 50 ms → max displacement = 1.75 m
    // quantized at 100 units/m → MAX = 175, with 25-unit headroom for float rounding
    const MAX_SINGLE_TICK_DZ = 200;

    for (const s of states.slice(1)) { // skip tick 0 (full sync)
      for (const delta of s.deltas) {
        // Each delta must fit within one tick's displacement.
        // Before the fix: dz at tick N = cumulative distance from sync tick → grows each tick.
        // After the fix:  dz at tick N = per-frame velocity → bounded by max speed per tick.
        expect(Math.abs(delta.dz)).toBeLessThan(MAX_SINGLE_TICK_DZ);
        expect(Math.abs(delta.dx)).toBeLessThan(MAX_SINGLE_TICK_DZ);
        expect(Math.abs(delta.dy)).toBeLessThan(MAX_SINGLE_TICK_DZ);
      }
    }

    // ── Simulated client reconstruction: incremental stacking of deltas ───────
    // Mirrors RaceNetwork.handleMessage exactly.
    const clientBaseline = new Map<string, { x: number; z: number }>();
    const tick0 = states[0];
    for (const p of tick0.players) {
      clientBaseline.set(p.id, { x: p.pos.x, z: p.pos.z });
    }

    // Apply all 30 delta ticks
    for (const s of states.slice(1)) {
      for (const delta of s.deltas) {
        const bl = clientBaseline.get(delta.id);
        if (!bl) continue;
        clientBaseline.set(delta.id, {
          x: bl.x + delta.dx / 100,
          z: bl.z + delta.dz / 100,
        });
      }
    }

    // The client's reconstructed position after 30 delta ticks should be in
    // the same order of magnitude as 30 ticks at ~10-35 m/s ≈ 15–52 m of travel.
    // It must NOT be thousands of meters (which is what happens before the fix,
    // because cumulative deltas stack as pos_0 + Σ(pos_N-pos_0) = N×pos_30 - (N-1)×pos_0).
    for (const [, pos] of clientBaseline) {
      expect(Math.abs(pos.z)).toBeLessThan(200); // reasonable upper bound (200 m)
    }

    room.cleanup();
  });
});
