/**
 * RemoteInterpolation — smooth interpolation of remote player states.
 *
 * Key design decision: every snapshot stored in the buffer is COMPLETE —
 * it contains an entry for every player ever seen, using their last-known
 * state when no new data arrived for a given tick. This prevents idle players
 * (who are omitted from delta ticks) from vanishing between full-sync intervals.
 */
import type { PlayerGameState } from "@neondrift/shared";

interface StateSnapshot {
  /** Server timestamp when this state was produced */
  serverTime: number;
  /** playerId -> state (always complete: all known players are present) */
  states: Map<string, PlayerGameState>;
}

export class RemoteInterpolation {
  private buffer: StateSnapshot[] = [];

  /**
   * Tracks the most recent known state for every player.
   * Used to fill gaps in sparse delta snapshots so buffers are always complete.
   */
  private lastKnown = new Map<string, PlayerGameState>();

  /**
   * Render this many ms behind the latest received state.
   * 150 ms = 3 ticks at 20 Hz — enough cushion to absorb single-packet jitter
   * without falling into the no-after-snapshot extrapolation path.
   */
  private readonly BUFFER_TIME_MS = 150;

  /**
   * Keep 30 snapshots — at 20 Hz that's 1.5 s of history.
   * Must comfortably exceed the full-sync interval (60 ticks = 3 s) divided
   * by the proportion of time we need for interpolation. In practice
   * BUFFER_TIME_MS (100 ms = 2 ticks) is well within this window.
   */
  private readonly MAX_BUFFER = 30;

  /**
   * Add a new server snapshot to the buffer.
   *
   * @param serverTime  Server wall-clock time for this tick (ms)
   * @param players     Only the players with new data this tick (may be a
   *                    partial list on delta ticks — this is intentional)
   * @param activePlayers  If provided (full-sync only), the complete set of
   *                       active player IDs; used to prune departed players.
   */
  addSnapshot(
    serverTime: number,
    players: PlayerGameState[],
    activePlayers?: Set<string>,
  ): void {
    // 1. Update last-known states with freshly received data
    for (const p of players) {
      this.lastKnown.set(p.id, p);
    }

    // 2. On full-sync, remove players no longer in the room
    if (activePlayers) {
      for (const id of this.lastKnown.keys()) {
        if (!activePlayers.has(id)) {
          this.lastKnown.delete(id);
        }
      }
    }

    // 3. Build a COMPLETE snapshot using lastKnown so idle players remain visible
    const states = new Map<string, PlayerGameState>(this.lastKnown);

    this.buffer.push({ serverTime, states });

    // Keep only the most recent MAX_BUFFER snapshots (trim oldest)
    if (this.buffer.length > this.MAX_BUFFER) {
      this.buffer.splice(0, this.buffer.length - this.MAX_BUFFER);
    }

    // Buffer is inserted in ascending order by construction, but sort for
    // safety in case of out-of-order delivery
    this.buffer.sort((a, b) => a.serverTime - b.serverTime);
  }

  /**
   * Get interpolated state for all remote players.
   * Renders at (clientNow + serverTimeOffset - BUFFER_TIME_MS) in server time.
   *
   * @param clientNow         Current client time (Date.now())
   * @param serverTimeOffset  Estimated offset: serverTime ≈ clientTime + offset
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

    for (const snap of this.buffer) {
      if (snap.serverTime <= renderTime) {
        before = snap;
      } else {
        after = snap;
        break;
      }
    }

    // Only snapshots in the future — use the earliest one
    if (!before && after) {
      return new Map(after.states);
    }

    // Only snapshots in the past — use the latest one (no extrapolation)
    if (before && !after) {
      return new Map(before.states);
    }

    // Both exist — interpolate between them
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

    // Union of all players present in either snapshot — never drop a player
    // just because they weren't updated in one of the two frames.
    const allIds = new Set([...a.states.keys(), ...b.states.keys()]);

    for (const id of allIds) {
      const stateA = a.states.get(id);
      const stateB = b.states.get(id);

      if (!stateA) {
        // Player appeared mid-interval — snap to their first known position
        result.set(id, stateB!);
      } else if (!stateB) {
        // Player was present in a but not b — hold their last position
        result.set(id, stateA);
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

  /** Returns the number of snapshots currently in the buffer. */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Returns the render timestamp (in server-clock ms) that getInterpolated()
   * would use right now. Useful for debug overlays.
   */
  getDebugRenderTime(clientNow: number, serverTimeOffset: number): number {
    return clientNow + serverTimeOffset - this.BUFFER_TIME_MS;
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
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

    // Ensure shortest arc
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (dot < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw;
      dot = -dot;
    }

    // Near-parallel quaternions — use normalised lerp to avoid NaN from acos
    if (dot > 0.9995) {
      const rx = a.x + (bx - a.x) * t;
      const ry = a.y + (by - a.y) * t;
      const rz = a.z + (bz - a.z) * t;
      const rw = a.w + (bw - a.w) * t;
      const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw);
      return { x: rx / len, y: ry / len, z: rz / len, w: rw / len };
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
