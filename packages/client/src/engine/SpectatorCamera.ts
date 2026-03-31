// ─── Spectator Camera ─────────────────────────────────────────────────────────
//
// Follows the race leader (highest lap + furthest segment progress).
// Uses a FreeCamera positioned behind and above the leader's last known
// position, smoothly interpolated with an exponential lerp.

import {
  Scene,
  Vector3,
  FreeCamera,
} from "@babylonjs/core";
import type { PlayerGameState } from "@neondrift/shared";

const SPECTATOR_DIST = 10;    // m behind leader
const SPECTATOR_HEIGHT = 4;   // m above leader
const LERP_FACTOR = 0.05;     // per-frame interpolation (fraction of remaining distance)
const LOOK_AHEAD = 8;         // m ahead of leader used as look-at target

/**
 * Spectator camera that smoothly follows the race leader.
 */
export class SpectatorCamera {
  private scene: Scene;
  private camera: FreeCamera;
  private _active = false;
  private _prevCamera: import("@babylonjs/core").Camera | null = null;

  // Last known leader heading (yaw in radians)
  private _leaderYaw = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this.camera = new FreeCamera(
      "spectatorCamera",
      new Vector3(0, SPECTATOR_HEIGHT, -SPECTATOR_DIST),
      scene,
    );
    this.camera.minZ = 0.1;
    this.camera.maxZ = 3000;
  }

  /**
   * Find the race leader and update the camera to follow them.
   *
   * Leader determination:
   *   1. Filter out finished players (use finish order if desired later)
   *   2. Highest lap wins
   *   3. Tie-break: compare position along Z as a rough "track progress" proxy
   *      (a proper implementation would use a signed arc-length along the spline)
   */
  update(players: PlayerGameState[]): void {
    if (!this._active || players.length === 0) return;

    // Pick leader
    const leader = this._findLeader(players);
    if (!leader) return;

    const leaderPos = new Vector3(leader.pos.x, leader.pos.y, leader.pos.z);

    // Derive yaw from velocity if available (non-zero velocity)
    const speed = Math.sqrt(
      leader.vel.x * leader.vel.x +
      leader.vel.y * leader.vel.y +
      leader.vel.z * leader.vel.z,
    );

    if (speed > 0.5) {
      // atan2(vx, vz) gives yaw in XZ plane
      this._leaderYaw = Math.atan2(leader.vel.x, leader.vel.z);
    }

    // Ideal camera position: behind and above the leader
    const idealPos = new Vector3(
      leaderPos.x - Math.sin(this._leaderYaw) * SPECTATOR_DIST,
      leaderPos.y + SPECTATOR_HEIGHT,
      leaderPos.z - Math.cos(this._leaderYaw) * SPECTATOR_DIST,
    );

    // Exponential smoothing (lerp each frame)
    this.camera.position = Vector3.Lerp(
      this.camera.position,
      idealPos,
      LERP_FACTOR,
    );

    // Look ahead of leader
    const lookAt = new Vector3(
      leaderPos.x + Math.sin(this._leaderYaw) * LOOK_AHEAD,
      leaderPos.y + 1.0,
      leaderPos.z + Math.cos(this._leaderYaw) * LOOK_AHEAD,
    );
    this.camera.setTarget(lookAt);
  }

  /**
   * Make this camera the active scene camera.
   * Saves the previous active camera so it can be restored on deactivate().
   */
  activate(): void {
    if (this._active) return;
    this._prevCamera = this.scene.activeCamera;
    this.scene.activeCamera = this.camera;
    this._active = true;
    console.log("[SpectatorCamera] activated");
  }

  /**
   * Restore the previous active camera.
   */
  deactivate(): void {
    if (!this._active) return;
    this._active = false;
    if (this._prevCamera) {
      this.scene.activeCamera = this._prevCamera;
      this._prevCamera = null;
    }
    console.log("[SpectatorCamera] deactivated");
  }

  get isActive(): boolean {
    return this._active;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _findLeader(players: PlayerGameState[]): PlayerGameState | null {
    let leader: PlayerGameState | null = null;

    for (const p of players) {
      if (!leader) {
        leader = p;
        continue;
      }

      // Higher lap = further along
      if (p.lap > leader.lap) {
        leader = p;
        continue;
      }

      if (p.lap === leader.lap) {
        // Rough progress: use distance from origin as a proxy
        // (positive Z = forward in most NeonDrift tracks)
        const pDist = Math.sqrt(p.pos.x * p.pos.x + p.pos.z * p.pos.z);
        const lDist = Math.sqrt(leader.pos.x * leader.pos.x + leader.pos.z * leader.pos.z);
        if (pDist > lDist) {
          leader = p;
        }
      }
    }

    return leader;
  }
}
