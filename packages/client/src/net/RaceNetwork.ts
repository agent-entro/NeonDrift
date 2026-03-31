/**
 * RaceNetwork — bridges WebSocket state stream into the 3D scene.
 *
 * Responsibilities:
 *  - Sends local player input to the server every render frame
 *  - Receives StateMessage; handles full snapshots AND delta-compressed updates
 *  - Maintains GhostCar meshes for all remote players
 *  - Feeds received states into RemoteInterpolation for smooth rendering
 *  - Updates the minimap with remote car positions
 *
 * Delta-compression protocol (CRITICAL):
 *  The server sends two classes of position updates in each StateMessage:
 *    - stateMsg.players  — full PlayerGameState objects (sent on is_full_sync ticks)
 *    - stateMsg.deltas   — PlayerPositionDelta objects (all other ticks)
 *
 *  Delta values (dx/dy/dz/dyaw) are always computed on the server as:
 *    delta = currentValue - lastFullSyncBaseline
 *  They are NOT incremental deltas from the previous delta tick.
 *
 *  Therefore the client must maintain two separate maps:
 *    baselines    — the last full-snapshot state per player (only updated on
 *                   is_full_sync ticks); used as the fixed reference for delta math
 *    latestStates — the most recently reconstructed state per player (updated
 *                   every tick); fed to the interpolation buffer
 *
 *  Mixing these two maps (e.g. updating baselines on every delta tick) causes
 *  double-accumulation of deltas, producing the "flash/drift/snap" artefacts
 *  visible every ~3 seconds (= one full-sync interval at 20 Hz x 60 ticks).
 */
import type { Scene } from "@babylonjs/core";
import type {
  ServerMessage,
  PlayerGameState,
  StateMessage,
} from "@neondrift/shared";
import type { NetClient } from "./NetClient.js";
import type { CarPhysicsInput } from "../engine/car.js";
import type { Minimap } from "../engine/Minimap.js";
import { GhostCar } from "../engine/GhostCar.js";
import { RemoteInterpolation } from "./Interpolation.js";

export class RaceNetwork {
  private readonly ghosts = new Map<string, GhostCar>();
  private readonly interpolation = new RemoteInterpolation();

  /**
   * Full-snapshot baselines per player.
   * ONLY updated when a full snapshot (is_full_sync=true) is received.
   * Used as the fixed reference point for reconstructing delta updates.
   */
  private readonly baselines = new Map<string, PlayerGameState>();

  /**
   * Most recently reconstructed state per player.
   * Updated on every tick — full snapshot OR delta.
   * Fed into the interpolation buffer so every player is always present
   * regardless of whether they moved this tick.
   */
  private readonly latestStates = new Map<string, PlayerGameState>();

  /**
   * Exponentially-smoothed server-clock offset (ms).
   * Approximates: serverClockMs = Date.now() + serverTimeOffset
   *
   * Raw per-message samples are noisy (RTT jitter), so we use an EMA with a
   * slow alpha=0.05 to produce a stable offset. The first sample seeds the filter
   * directly to avoid a long ramp-up delay.
   */
  private serverTimeOffset = 0;
  private serverTimeOffsetInitialized = false;
  private static readonly CLOCK_EMA_ALPHA = 0.05;

  private readonly unsub: () => void;

  constructor(
    private readonly scene: Scene,
    private readonly netClient: NetClient,
    private readonly localPlayerId: string,
    private readonly minimap?: Minimap,
  ) {
    this.unsub = netClient.onMessage((msg) => this.handleMessage(msg));
    console.log("[RaceNetwork] initialized for player", localPlayerId);
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.type !== "state") return;
    const stateMsg = msg as StateMessage;

    // -- Clock synchronisation -------------------------------------------
    // EMA smoothing prevents a single high-latency packet from shifting the
    // render time and causing a visible jump in all ghost positions.
    const rawOffset = stateMsg.server_time - Date.now();
    if (!this.serverTimeOffsetInitialized) {
      this.serverTimeOffset = rawOffset;
      this.serverTimeOffsetInitialized = true;
    } else {
      const alpha = RaceNetwork.CLOCK_EMA_ALPHA;
      this.serverTimeOffset = this.serverTimeOffset + alpha * (rawOffset - this.serverTimeOffset);
    }

    // -- Full snapshots ---------------------------------------------------
    // stateMsg.players is non-empty only on full-sync ticks.
    // Update BOTH baselines and latestStates; the baseline becomes the new
    // reference point for all subsequent delta calculations.
    for (const player of stateMsg.players) {
      this.baselines.set(player.id, player);
      this.latestStates.set(player.id, player);
    }

    // -- Delta-compressed updates -----------------------------------------
    // Each delta encodes:  value = current - lastFullSyncBaseline
    // We ALWAYS apply the delta against this.baselines (full-sync state),
    // never against a previously reconstructed delta state. Only latestStates
    // is updated here; baselines must remain at the last full-sync position.
    for (const delta of stateMsg.deltas) {
      const baseline = this.baselines.get(delta.id);
      if (!baseline) continue; // no baseline yet, wait for next full sync

      const newPos = {
        x: baseline.pos.x + delta.dx / 100,
        y: baseline.pos.y + delta.dy / 100,
        z: baseline.pos.z + delta.dz / 100,
      };

      // The server encodes rotation as a pure Y-axis quaternion: (0, sin(h/2), 0, cos(h/2)).
      // Extract yaw from the FULL-SYNC baseline quaternion, apply dyaw, re-encode.
      // Using baseline.rot (not latestStates rot) matches the server's reference frame.
      const baselineYaw = 2 * Math.atan2(baseline.rot.y, baseline.rot.w);
      const newYaw = baselineYaw + delta.dyaw / 1000;
      const half = newYaw / 2;
      const newRot = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };

      const reconstructed: PlayerGameState = {
        ...baseline,
        pos: newPos,
        rot: newRot,
        // Reconstruct velocity from current yaw + speed so the interpolation
        // buffer has fresh vel data rather than stale full-sync values.
        vel: {
          x: Math.sin(newYaw) * (delta.speed / 10),
          y: baseline.vel.y,
          z: Math.cos(newYaw) * (delta.speed / 10),
        },
      };

      // Update ONLY latestStates — baselines stay fixed at the last full sync.
      this.latestStates.set(delta.id, reconstructed);
    }

    // -- Prune stale ghosts on full sync ----------------------------------
    let activeIds: Set<string> | undefined;
    if (stateMsg.is_full_sync) {
      activeIds = new Set(stateMsg.players.map((p) => p.id));
      for (const [id, ghost] of this.ghosts) {
        if (!activeIds.has(id)) {
          ghost.dispose();
          this.ghosts.delete(id);
          this.baselines.delete(id);
          this.latestStates.delete(id);
          console.log("[RaceNetwork] removed ghost for departed player", id);
        }
      }
    }

    // -- Feed into interpolation buffer -----------------------------------
    // Pass all latestStates every tick. The interpolation buffer uses its own
    // lastKnown map to keep idle players visible, but feeding complete state
    // every tick ensures the freshest vel data is always present.
    // Pass activeIds on full-sync ticks so Interpolation can prune lastKnown.
    const allKnownStates = Array.from(this.latestStates.values());
    this.interpolation.addSnapshot(stateMsg.server_time, allKnownStates, activeIds);
  }

  /**
   * Called once per render frame. Sends input and repositions ghost meshes.
   */
  tick(input: CarPhysicsInput, clientTick: number): void {
    this.netClient.send({
      type: "input",
      tick: clientTick,
      steering: Math.max(-1, Math.min(1, input.steer)),
      throttle: Math.max(0, Math.min(1, input.throttle)),
      brake: input.brake > 0.5,
      boost: input.boost,
    });

    const states = this.interpolation.getInterpolated(Date.now(), this.serverTimeOffset);
    const ghostPositions: { x: number; z: number }[] = [];

    for (const [id, state] of states) {
      if (id === this.localPlayerId) continue;

      let ghost = this.ghosts.get(id);
      if (!ghost) {
        ghost = new GhostCar(this.scene);
        this.ghosts.set(id, ghost);
        console.log("[RaceNetwork] spawned ghost for player", id);
      }

      ghost.updateFromState(state.pos, state.rot);
      ghostPositions.push({ x: state.pos.x, z: state.pos.z });
    }

    this.minimap?.updateRemoteCars(ghostPositions);
  }

  dispose(): void {
    this.unsub();
    for (const ghost of this.ghosts.values()) ghost.dispose();
    this.ghosts.clear();
    this.baselines.clear();
    this.latestStates.clear();
    this.minimap?.updateRemoteCars([]);
    console.log("[RaceNetwork] disposed");
  }
}
