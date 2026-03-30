import { WebSocket, WebSocketServer } from "ws";
import { unpack, pack } from "msgpackr";
import type { ClientMessage, JoinMessage } from "@neondrift/shared";
import type { RoomManager } from "./RoomManager.js";

/**
 * Simple in-memory session store.
 * In a real app this would validate against a DB.
 * Maps session_token -> playerId.
 */
const sessionStore = new Map<string, { playerId: string; displayName: string }>();

/**
 * Register a known session (used for testing).
 */
export function registerSession(
  token: string,
  playerId: string,
  displayName: string,
): void {
  sessionStore.set(token, { playerId, displayName });
}

/**
 * Validate a session token.
 * Returns player info or null if invalid.
 */
function validateSession(
  token: string,
): { playerId: string; displayName: string } | null {
  // For test rooms, accept any token and use a derived playerId
  if (token.startsWith("test-")) {
    const playerId = token.replace("test-", "player-");
    return { playerId, displayName: `Player-${playerId.slice(-4)}` };
  }
  return sessionStore.get(token) ?? null;
}

/** Per-connection state before the player has joined a room */
interface PendingConnection {
  ws: WebSocket;
  joinedRoomId: string | null;
  playerId: string | null;
}

export function setupWsHandler(wss: WebSocketServer, roomManager: RoomManager): void {
  wss.on("connection", (ws: WebSocket) => {
    const conn: PendingConnection = {
      ws,
      joinedRoomId: null,
      playerId: null,
    };

    ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      let buf: Buffer;
      if (Buffer.isBuffer(data)) {
        buf = data;
      } else if (data instanceof ArrayBuffer) {
        buf = Buffer.from(data);
      } else {
        // Buffer[]
        buf = Buffer.concat(data as Buffer[]);
      }

      let msg: ClientMessage;
      try {
        msg = unpack(buf) as ClientMessage;
      } catch {
        sendError(ws, "invalid_message", "Failed to parse message");
        return;
      }

      if (!conn.joinedRoomId) {
        // Expect a "join" message first
        if (msg.type !== "join") {
          sendError(ws, "not_in_room", "Send a join message first");
          return;
        }
        handleJoin(ws, conn, msg as JoinMessage, roomManager);
        return;
      }

      // Relay subsequent messages to the room
      const room = roomManager.getRoom(conn.joinedRoomId);
      if (!room) {
        sendError(ws, "room_not_found", `Room ${conn.joinedRoomId} not found`);
        return;
      }

      if (conn.playerId) {
        room.handleMessage(conn.playerId, msg);
      }
    });

    ws.on("close", () => {
      if (conn.joinedRoomId && conn.playerId) {
        const room = roomManager.getRoom(conn.joinedRoomId);
        room?.handleDisconnect(ws);
      }
    });

    ws.on("error", (err) => {
      console.error("[ws] socket error:", err.message);
    });
  });
}

function handleJoin(
  ws: WebSocket,
  conn: PendingConnection,
  msg: JoinMessage,
  roomManager: RoomManager,
): void {
  // Validate session
  const sessionInfo = validateSession(msg.session_token);
  if (!sessionInfo) {
    sendError(ws, "unauthorized", "Invalid session token");
    return;
  }

  const { playerId, displayName } = sessionInfo;
  // Use player_id from message if it matches, or override with session
  const resolvedPlayerId = msg.player_id || playerId;

  // Look up or create room
  let room = roomManager.getRoom(msg.room_id);
  if (!room) {
    // Auto-create room for testing convenience
    try {
      room = roomManager.createRoom(msg.room_id, "city-canyon", resolvedPlayerId, 8);
    } catch (err) {
      sendError(ws, "room_error", String(err));
      return;
    }
  }

  const isSpectator = msg.spectate === true;
  const phase = room.getPhase();

  // Reconnect if room is in racing phase
  if (phase === "racing" || phase === "countdown") {
    room.handleReconnect(ws, resolvedPlayerId);
    conn.joinedRoomId = msg.room_id;
    conn.playerId = resolvedPlayerId;
    return;
  }

  // Calculate next slot
  const slot = room.getPlayerCount();

  room.addPlayer(ws, resolvedPlayerId, displayName, slot, isSpectator);
  conn.joinedRoomId = msg.room_id;
  conn.playerId = resolvedPlayerId;
}

function sendError(ws: WebSocket, code: string, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(pack({ type: "error", code, message }));
  }
}
