/**
 * Records race ticks to a binary replay file (msgpack frames).
 * Each frame is: [4-byte uint32 tick] + [msgpack-encoded frame body]
 * Stored at: ./replays/<raceId>.bin
 *
 * Frames are buffered in memory and written atomically on finish().
 * A 3-min race at 20fps produces ~3600 frames × ~200B = ~720KB — well within memory budget.
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pack } from "msgpackr";
import type { PlayerGameState, PowerupSpawn } from "@neondrift/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPLAYS_DIR = join(__dirname, "..", "..", "replays");

export interface ReplayFrame {
  tick: number;
  server_time: number;
  players: PlayerGameState[];
  powerups: PowerupSpawn[];
}

export class ReplayRecorder {
  private raceId: string;
  private _path: string;
  private _chunks: Buffer[] = [];
  private _running = false;

  constructor(raceId: string) {
    this.raceId = raceId;
    this._path = ReplayRecorder.getPath(raceId);
  }

  /** Call once at race start */
  start(): void {
    this._chunks = [];
    this._running = true;
  }

  /** Record one tick's state */
  recordTick(frame: ReplayFrame): void {
    if (!this._running) return;

    // 4-byte big-endian tick header
    const tickBuf = Buffer.allocUnsafe(4);
    tickBuf.writeUInt32BE(frame.tick, 0);

    const encoded = pack(frame) as Buffer;
    this._chunks.push(tickBuf, encoded);
  }

  /** Write replay to disk. Returns the path or null if nothing recorded. */
  finish(): string | null {
    if (!this._running || this._chunks.length === 0) {
      this._running = false;
      return null;
    }
    this._running = false;

    try {
      mkdirSync(REPLAYS_DIR, { recursive: true });
      const data = Buffer.concat(this._chunks);
      writeFileSync(this._path, data);
      const frameCount = this._chunks.length / 2; // each frame = 2 chunks
      console.log(`[replay] saved ${frameCount} frames → ${this._path}`);
      return this._path;
    } catch (err) {
      console.error(`[replay] write error: ${(err as Error).message}`);
      return null;
    } finally {
      this._chunks = [];
    }
  }

  /** Get path to replay file */
  get path(): string {
    return this._path;
  }

  static exists(raceId: string): boolean {
    return existsSync(ReplayRecorder.getPath(raceId));
  }

  static getPath(raceId: string): string {
    // Sanitize raceId to prevent path traversal
    const safe = raceId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(REPLAYS_DIR, `${safe}.bin`);
  }
}
