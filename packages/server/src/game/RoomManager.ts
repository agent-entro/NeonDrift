import { GameRoom } from "./GameRoom.js";
import { MAX_ROOMS } from "@neondrift/shared";

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();

  createRoom(
    roomId: string,
    trackId: string,
    hostPlayerId: string,
    maxPlayers: number,
  ): GameRoom {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new Error(`Server at capacity: max ${MAX_ROOMS} rooms`);
    }

    if (this.rooms.has(roomId)) {
      throw new Error(`Room ${roomId} already exists`);
    }

    const room = new GameRoom(roomId, trackId, hostPlayerId, maxPlayers, () => {
      this.removeRoom(roomId);
    });

    this.rooms.set(roomId, room);
    console.log(`[RoomManager] created room ${roomId} (track: ${trackId})`);
    return room;
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  getActiveRooms(): GameRoom[] {
    return [...this.rooms.values()];
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.cleanup();
    this.rooms.delete(roomId);
    console.log(`[RoomManager] removed room ${roomId}`);
  }

  cleanup(): void {
    for (const [roomId, room] of this.rooms) {
      room.cleanup();
      this.rooms.delete(roomId);
    }
  }
}
