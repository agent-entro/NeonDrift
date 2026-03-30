import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameRoom, type RoomPhase } from "../game/GameRoom.js";
import { pack, unpack } from "msgpackr";
import type { ServerMessage } from "@neondrift/shared";

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

class MockWebSocket {
  readyState = 1; // OPEN
  messages: ServerMessage[] = [];
  closed = false;

  send(data: Buffer | Uint8Array): void {
    const msg = unpack(data) as ServerMessage;
    this.messages.push(msg);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3; // CLOSED
  }

  lastMessage(): ServerMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  messagesOfType(type: string): ServerMessage[] {
    return this.messages.filter((m) => m.type === type);
  }
}

// WebSocket.OPEN constant
const WS_OPEN = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createRoom(onEmpty?: () => void): GameRoom {
  return new GameRoom(
    "test-room",
    "city-canyon",
    "host-1",
    8,
    onEmpty ?? (() => {}),
  );
}

function makeMockWs(): MockWebSocket {
  return new MockWebSocket();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GameRoom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it("starts in lobby phase", () => {
    const room = createRoom();
    expect(room.getPhase()).toBe("lobby");
  });

  it("has zero players initially", () => {
    const room = createRoom();
    expect(room.getPlayerCount()).toBe(0);
  });

  it("players can join", () => {
    const room = createRoom();
    const ws = makeMockWs();
    room.addPlayer(ws as any, "p1", "Alice", 0, false);

    expect(room.getPlayerCount()).toBe(1);

    // Should have sent welcome message
    const welcome = ws.messagesOfType("welcome");
    expect(welcome.length).toBeGreaterThan(0);
    expect((welcome[0] as any).player_id).toBe("p1");
  });

  it("sends room_state to joining player", () => {
    const room = createRoom();
    const ws = makeMockWs();
    room.addPlayer(ws as any, "p1", "Alice", 0, false);

    const roomState = ws.messagesOfType("room_state");
    expect(roomState.length).toBeGreaterThan(0);
  });

  it("ready state toggles", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    room.addPlayer(ws1 as any, "p1", "Alice", 0, false);

    room.setReady("p1", true);

    const roomState = ws1.messagesOfType("room_state");
    const last = roomState[roomState.length - 1] as any;
    const p1State = last.players.find((p: any) => p.player_id === "p1");
    expect(p1State.is_ready).toBe(true);

    room.setReady("p1", false);
    const roomState2 = ws1.messagesOfType("room_state");
    const last2 = roomState2[roomState2.length - 1] as any;
    const p1State2 = last2.players.find((p: any) => p.player_id === "p1");
    expect(p1State2.is_ready).toBe(false);
  });

  it("countdown starts when all players (>=2) are ready", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    room.addPlayer(ws1 as any, "p1", "Alice", 0, false);
    room.addPlayer(ws2 as any, "p2", "Bob", 1, false);

    room.setReady("p1", true);
    // Not enough ready yet — still lobby
    expect(room.getPhase()).toBe("lobby");

    room.setReady("p2", true);
    // Both ready — should start countdown
    expect(room.getPhase()).toBe("countdown");

    // Should have sent countdown messages
    const countdowns = ws1.messagesOfType("countdown");
    expect(countdowns.length).toBeGreaterThan(0);
    expect((countdowns[0] as any).seconds).toBe(3);
  });

  it("race starts after countdown completes", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    room.addPlayer(ws1 as any, "p1", "Alice", 0, false);
    room.addPlayer(ws2 as any, "p2", "Bob", 1, false);

    room.setReady("p1", true);
    room.setReady("p2", true);
    expect(room.getPhase()).toBe("countdown");

    // Advance timers through the countdown (3 seconds + 1 more for final)
    vi.advanceTimersByTime(4000);

    expect(room.getPhase()).toBe("racing");

    // Should have sent race_start message
    const raceStart = ws1.messagesOfType("race_start");
    expect(raceStart.length).toBeGreaterThan(0);

    // Cleanup
    room.cleanup();
  });

  it("state tick increments during race", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    room.addPlayer(ws1 as any, "p1", "Alice", 0, false);
    room.addPlayer(ws2 as any, "p2", "Bob", 1, false);

    room.setReady("p1", true);
    room.setReady("p2", true);

    // Start race
    vi.advanceTimersByTime(4000);
    expect(room.getPhase()).toBe("racing");

    // Advance a few ticks
    vi.advanceTimersByTime(200); // 200ms = 4 ticks at 20Hz

    // Should have state messages
    const stateMsgs = ws1.messagesOfType("state");
    expect(stateMsgs.length).toBeGreaterThan(0);

    // Tick numbers should be increasing
    const ticks = stateMsgs.map((m) => (m as any).tick);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }

    room.cleanup();
  });

  it("room transitions to finished when all players finish (time-based laps)", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    room.addPlayer(ws1 as any, "p1", "Alice", 0, false);
    room.addPlayer(ws2 as any, "p2", "Bob", 1, false);

    room.setReady("p1", true);
    room.setReady("p2", true);

    // Start race
    vi.advanceTimersByTime(4000);
    expect(room.getPhase()).toBe("racing");

    // Advance 3 full laps (3 * 60 seconds = 180 seconds + a bit more to trigger final check)
    vi.advanceTimersByTime(181 * 1000);

    expect(room.getPhase()).toBe("finished");

    // Should have sent race_finish message
    const finishMsgs = ws1.messagesOfType("race_finish");
    expect(finishMsgs.length).toBeGreaterThan(0);
  });

  it("reconnect within grace period works", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    room.addPlayer(ws1 as any, "p1", "Alice", 0, false);
    room.addPlayer(ws2 as any, "p2", "Bob", 1, false);

    room.setReady("p1", true);
    room.setReady("p2", true);
    vi.advanceTimersByTime(4000);
    expect(room.getPhase()).toBe("racing");

    // Disconnect p1
    room.handleDisconnect(ws1 as any);

    // Reconnect within grace period (5 seconds)
    vi.advanceTimersByTime(5000);
    const ws1New = makeMockWs();
    room.handleReconnect(ws1New as any, "p1");

    // Should have sent welcome on reconnect
    const welcome = ws1New.messagesOfType("welcome");
    expect(welcome.length).toBeGreaterThan(0);

    room.cleanup();
  });

  it("onEmpty callback fires when last player leaves in lobby", () => {
    const onEmpty = vi.fn();
    const room = createRoom(onEmpty);
    const ws1 = makeMockWs();

    room.addPlayer(ws1 as any, "p1", "Alice", 0, false);
    room.handleDisconnect(ws1 as any);

    expect(onEmpty).toHaveBeenCalled();
  });

  it("spectators receive room state but are not counted as players", () => {
    const room = createRoom();
    const spectatorWs = makeMockWs();

    room.addPlayer(spectatorWs as any, "spec1", "Viewer", 0, true);

    expect(room.getPlayerCount()).toBe(0);

    const welcome = spectatorWs.messagesOfType("welcome");
    expect(welcome.length).toBeGreaterThan(0);
  });

  it("room cannot start race with only 1 player", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    room.addPlayer(ws1 as any, "p1", "Alice", 0, false);
    room.setReady("p1", true);

    // Only 1 player — should stay in lobby
    expect(room.getPhase()).toBe("lobby");
  });

  it("cleanup stops the tick interval", () => {
    const room = createRoom();
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    room.addPlayer(ws1 as any, "p1", "Alice", 0, false);
    room.addPlayer(ws2 as any, "p2", "Bob", 1, false);

    room.setReady("p1", true);
    room.setReady("p2", true);
    vi.advanceTimersByTime(4000);
    expect(room.getPhase()).toBe("racing");

    room.cleanup();

    const msgCountBefore = ws1.messages.length;
    vi.advanceTimersByTime(500);
    // No new messages after cleanup
    expect(ws1.messages.length).toBe(msgCountBefore);
  });
});
