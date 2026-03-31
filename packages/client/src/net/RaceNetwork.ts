/**
 * RaceNetwork — bridges WebSocket state stream into the 3D scene.
 *
 * Responsibilities:
 *  - Sends local player input to the server every render frame
 *  - Receives StateMessage; handles full snapshots AND delta-compressed updates
 *  - Maintains GhostCar meshes for all remote players
 *  - Feeds received states into RemoteInterpolation for smooth rendering
 *  - Updates the minimap with remote car positions
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
   * Full-state baselines used to reconstruct delta-compressed updates.
   * Keyed by playerId.
   */
  private readonly baselines = new Map<string, PlayerGameState>();

  /**
   * Estimated offset between server clock and client clock (ms).
   * serverTime = Date.now() + serverTimeOffset
   */
  private serverTimeOffset = 0;

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

    // Update clock offset estimate
    this.serverTimeOffset = stateMsg.server_time - Date.now();

    // Diagnostic: log first 5 ticks to confirm we're receiving state for remote players
    if (stateMsg.tick < 5) {
      console.log(
        `[RaceNetwork] tick=${stateMsg.tick} full=${stateMsg.players.length} deltas=${stateMsg.deltas.length} is_full_sync=${stateMsg.is_full_sync}`,
        stateMsg.players.map((p) => p.id),
      );
    }

    // Full snapshots
    for (const player of stateMsg.players) {
      this.baselines.set(player.id, player);
    }

    // Delta-compressed updates
    const deltaStates: PlayerGameState[] = [];

    for (const delta of stateMsg.deltas) {
      const baseline = this.baselines.get(delta.id);
      if (!baseline) continue; // no baseline yet, wait for next full sync

      const newPos = {
        x: baseline.pos.x + delta.dx / 100,
        y: baseline.pos.y + delta.dy / 100,
        z: baseline.pos.z + delta.dz / 100,
      };

      const baselineYaw = 2 * Math.atan2(baseline.rot.y, baseline.rot.w);
      const newYaw = baselineYaw + delta.dyaw / 1000;
      const half = newYaw / 2;
      const newRot = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };

      const reconstructed: PlayerGameState = { ...baseline, pos: newPos, rot: newRot };
      this.baselines.set(delta.id, reconstructed);
      deltaStates.push(reconstructed);
    }

    // Prune stale ghosts on full sync
    let activeIds: Set<string> | undefined;
    if (stateMsg.is_full_sync) {
      activeIds = new Set(stateMsg.players.map((p) => p.id));
      for (const [id, ghost] of this.ghosts) {
        if (!activeIds.has(id)) {
          ghost.dispose();
          this.ghosts.delete(id);
          this.baselines.delete(id);
          console.log("[RaceNetwork] removed ghost for departed player", id);
        }
      }
    }

    // Always add a snapshot — even when allStates is empty — so the
    // interpolation buffer stays current and idle players (absent from
    // delta ticks) remain visible via lastKnown state.
    const allStates = [...stateMsg.players, ...deltaStates];
    this.interpolation.addSnapshot(stateMsg.server_time, allStates, activeIds);
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
    this.minimap?.updateRemoteCars([]);
    console.log("[RaceNetwork] disposed");
  }
}
