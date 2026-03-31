/**
 * RaceNetwork — bridges WebSocket state stream into the 3D scene.
 *
 * Responsibilities:
 *  - Sends local player input to the server every render frame
 *  - Receives StateMessage; handles full snapshots AND delta-compressed updates
 *  - Maintains GhostCar meshes for all remote players
 *  - Feeds received states into RemoteInterpolation for smooth rendering
 */
import type { Scene } from "@babylonjs/core";
import type {
  ServerMessage,
  PlayerGameState,
  StateMessage,
} from "@neondrift/shared";
import type { NetClient } from "./NetClient.js";
import type { CarPhysicsInput } from "../engine/car.js";
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

  private clientTick = 0;
  private readonly unsub: () => void;

  constructor(
    private readonly scene: Scene,
    private readonly netClient: NetClient,
    private readonly localPlayerId: string,
  ) {
    this.unsub = netClient.onMessage((msg) => this.handleMessage(msg));
    console.log("[RaceNetwork] initialized for player", localPlayerId);
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.type !== "state") return;
    const stateMsg = msg as StateMessage;

    // Update clock offset estimate
    this.serverTimeOffset = stateMsg.server_time - Date.now();

    // ── Full snapshots ──────────────────────────────────────────────────────
    for (const player of stateMsg.players) {
      this.baselines.set(player.id, player);
    }

    // ── Delta-compressed updates ────────────────────────────────────────────
    // Each delta stores the *change* from the last known baseline.
    // We reconstruct the full state and update the baseline so future deltas
    // compound correctly.
    const deltaStates: PlayerGameState[] = [];

    for (const delta of stateMsg.deltas) {
      const baseline = this.baselines.get(delta.id);
      if (!baseline) {
        // No baseline yet — can't reconstruct, skip until next full sync
        continue;
      }

      const newPos = {
        x: baseline.pos.x + delta.dx / 100,
        y: baseline.pos.y + delta.dy / 100,
        z: baseline.pos.z + delta.dz / 100,
      };

      // The server stores rotation as a pure Y-axis quaternion (yawToQuat).
      // Extract yaw from the baseline quaternion, apply dyaw, re-encode.
      // For q = (0, sin(h), 0, cos(h)): yaw = 2 * atan2(q.y, q.w)
      const baselineYaw = 2 * Math.atan2(baseline.rot.y, baseline.rot.w);
      const newYaw = baselineYaw + delta.dyaw / 1000;
      const half = newYaw / 2;
      const newRot = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };

      const reconstructed: PlayerGameState = {
        ...baseline,
        pos: newPos,
        rot: newRot,
      };

      // Update baseline so the next delta uses the correct reference point
      this.baselines.set(delta.id, reconstructed);
      deltaStates.push(reconstructed);
    }

    // ── Prune stale ghosts on full sync ────────────────────────────────────
    if (stateMsg.is_full_sync) {
      const activeIds = new Set(stateMsg.players.map((p) => p.id));
      for (const [id, ghost] of this.ghosts) {
        if (!activeIds.has(id)) {
          ghost.dispose();
          this.ghosts.delete(id);
          this.baselines.delete(id);
          console.log("[RaceNetwork] removed ghost for departed player", id);
        }
      }
    }

    // ── Feed into interpolation buffer ─────────────────────────────────────
    const allStates = [...stateMsg.players, ...deltaStates];
    if (allStates.length > 0) {
      this.interpolation.addSnapshot(stateMsg.server_time, allStates);
    }
  }

  /**
   * Called once per render frame by the scene's update loop.
   * Sends input to the server and repositions all ghost meshes.
   *
   * @param input      Merged input state for this frame (keyboard + virtual joystick)
   * @param clientTick Monotonically-increasing frame counter for the input message
   */
  tick(input: CarPhysicsInput, clientTick: number): void {
    this.clientTick = clientTick;

    // Send local input to server (server runs authoritative physics)
    this.netClient.send({
      type: "input",
      tick: clientTick,
      steering: Math.max(-1, Math.min(1, input.steer)),
      throttle: Math.max(0, Math.min(1, input.throttle)),
      brake: input.brake > 0.5,
      boost: input.boost,
    });

    // Fetch interpolated remote-player states for this render timestamp
    const states = this.interpolation.getInterpolated(
      Date.now(),
      this.serverTimeOffset,
    );

    for (const [id, state] of states) {
      // Never render a ghost for the local player
      if (id === this.localPlayerId) continue;

      let ghost = this.ghosts.get(id);
      if (!ghost) {
        ghost = new GhostCar(this.scene);
        this.ghosts.set(id, ghost);
        console.log("[RaceNetwork] spawned ghost for player", id);
      }

      ghost.updateFromState(state.pos, state.rot);
    }
  }

  dispose(): void {
    this.unsub();
    for (const ghost of this.ghosts.values()) {
      ghost.dispose();
    }
    this.ghosts.clear();
    this.baselines.clear();
    console.log("[RaceNetwork] disposed");
  }
}
