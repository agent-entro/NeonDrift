import type { PlayerGameState } from "@neondrift/shared";

interface StateSnapshot {
  /** Server timestamp when this state was produced */
  serverTime: number;
  /** playerId -> state */
  states: Map<string, PlayerGameState>;
}

export class RemoteInterpolation {
  private buffer: StateSnapshot[] = [];
  /** Render this many ms behind the latest received state */
  private readonly BUFFER_TIME_MS = 100;
  private readonly MAX_BUFFER = 10;

  /**
   * Add a new server snapshot to the buffer.
   */
  addSnapshot(serverTime: number, players: PlayerGameState[]): void {
    const states = new Map<string, PlayerGameState>();
    for (const p of players) {
      states.set(p.id, p);
    }

    this.buffer.push({ serverTime, states });

    // Keep only the most recent MAX_BUFFER snapshots
    if (this.buffer.length > this.MAX_BUFFER) {
      this.buffer.splice(0, this.buffer.length - this.MAX_BUFFER);
    }

    // Keep buffer sorted by serverTime
    this.buffer.sort((a, b) => a.serverTime - b.serverTime);
  }

  /**
   * Get interpolated state for all remote players.
   * Renders at (clientNow - serverTimeOffset - BUFFER_TIME_MS) in server time.
   *
   * @param clientNow       Current client time (Date.now())
   * @param serverTimeOffset  Estimated offset: serverTime - clientTime
   */
  getInterpolated(
    clientNow: number,
    serverTimeOffset: number,
  ): Map<string, PlayerGameState> {
    const renderTime = clientNow + serverTimeOffset - this.BUFFER_TIME_MS;

    if (this.buffer.length === 0) {
      return new Map();
    }

    // Find the two snapshots that bracket renderTime
    let before: StateSnapshot | null = null;
    let after: StateSnapshot | null = null;

    for (let i = 0; i < this.buffer.length; i++) {
      const snap = this.buffer[i];
      if (snap.serverTime <= renderTime) {
        before = snap;
      } else {
        after = snap;
        break;
      }
    }

    // Only have snapshots after renderTime — use earliest
    if (!before && after) {
      return new Map(after.states);
    }

    // Only have snapshots before renderTime — use latest
    if (before && !after) {
      return new Map(before.states);
    }

    // Both exist — interpolate
    if (before && after) {
      const totalDt = after.serverTime - before.serverTime;
      const t = totalDt > 0 ? (renderTime - before.serverTime) / totalDt : 0;
      const clamped = Math.max(0, Math.min(1, t));

      return this.interpolateSnapshots(before, after, clamped);
    }

    return new Map();
  }

  private interpolateSnapshots(
    a: StateSnapshot,
    b: StateSnapshot,
    t: number,
  ): Map<string, PlayerGameState> {
    const result = new Map<string, PlayerGameState>();

    // All players present in b
    for (const [id, stateB] of b.states) {
      const stateA = a.states.get(id);
      if (!stateA) {
        // Player wasn't in previous snapshot — use b directly
        result.set(id, stateB);
      } else {
        result.set(id, this.interpolateState(stateA, stateB, t));
      }
    }

    return result;
  }

  private interpolateState(
    a: PlayerGameState,
    b: PlayerGameState,
    t: number,
  ): PlayerGameState {
    return {
      id: b.id,
      pos: this.lerpVec3(a.pos, b.pos, t),
      rot: this.slerpQuat(a.rot, b.rot, t),
      vel: this.lerpVec3(a.vel, b.vel, t),
      lap: b.lap,
      powerup: b.powerup,
      finished: b.finished,
      finish_time_ms: b.finish_time_ms,
    };
  }

  private lerpVec3(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    t: number,
  ): { x: number; y: number; z: number } {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    };
  }

  private slerpQuat(
    a: { x: number; y: number; z: number; w: number },
    b: { x: number; y: number; z: number; w: number },
    t: number,
  ): { x: number; y: number; z: number; w: number } {
    // Compute dot product
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

    // Ensure shortest path
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (dot < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw;
      dot = -dot;
    }

    // If quaternions are very close, use linear interpolation
    if (dot > 0.9995) {
      const result = {
        x: a.x + (bx - a.x) * t,
        y: a.y + (by - a.y) * t,
        z: a.z + (bz - a.z) * t,
        w: a.w + (bw - a.w) * t,
      };
      // Normalize
      const len = Math.sqrt(
        result.x * result.x + result.y * result.y +
        result.z * result.z + result.w * result.w,
      );
      return { x: result.x / len, y: result.y / len, z: result.z / len, w: result.w / len };
    }

    const theta0 = Math.acos(dot);
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);

    const s1 = Math.cos(theta) - dot * sinTheta / sinTheta0;
    const s2 = sinTheta / sinTheta0;

    return {
      x: s1 * a.x + s2 * bx,
      y: s1 * a.y + s2 * by,
      z: s1 * a.z + s2 * bz,
      w: s1 * a.w + s2 * bw,
    };
  }
}
