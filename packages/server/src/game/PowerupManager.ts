/**
 * Server-authoritative power-up manager.
 * Handles spawning, pickup detection, active effect tracking, and expiry.
 */

import type { PowerupKind, PowerupSpawn, Vec3 } from "@neondrift/shared";
import {
  POWERUP_BOOST_DURATION_MS,
  POWERUP_SHIELD_DURATION_MS,
  POWERUP_EMP_DURATION_MS,
  POWERUP_EMP_RADIUS_M,
  POWERUP_GRAVITY_WELL_DURATION_MS,
  POWERUP_GRAVITY_WELL_PULL,
  POWERUP_GRAVITY_WELL_RADIUS_M,
  POWERUP_TIME_WARP_DURATION_MS,
  POWERUP_TIME_WARP_RADIUS_M,
  POWERUP_TIME_WARP_SLOW_FACTOR,
  POWERUP_RESPAWN_MS,
} from "@neondrift/shared";

const PICKUP_RADIUS_M = 4;

const ALL_KINDS: PowerupKind[] = [
  "boost",
  "shield",
  "emp",
  "gravity_well",
  "time_warp",
];

function randKind(): PowerupKind {
  return ALL_KINDS[Math.floor(Math.random() * ALL_KINDS.length)];
}

function dist2d(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export interface ActiveEffect {
  kind: PowerupKind;
  expiresAt: number;
  /** For gravity_well: the holder's playerId */
  holderId?: string;
}

export class PowerupManager {
  /** All spawn slots (static positions) */
  private spawns: Map<string, PowerupSpawn> = new Map();
  /** Per-player active effects */
  private effects: Map<string, ActiveEffect> = new Map();
  /** Per-player: are they slowed by time_warp? */
  private slowedPlayers: Map<string, number> = new Map(); // playerId → expiresAt

  constructor(spawnPoints: Array<{ x: number; y: number; z: number }>) {
    spawnPoints.forEach((pt, i) => {
      const id = `pu_${i}`;
      this.spawns.set(id, {
        id,
        kind: randKind(),
        pos: { x: pt.x, y: pt.y, z: pt.z },
        available: true,
        respawn_at: null,
      });
    });
  }

  /** Get the current spawn state for broadcast */
  getSpawns(): PowerupSpawn[] {
    return [...this.spawns.values()];
  }

  /**
   * Check if any player drove over a power-up and trigger pickup.
   * Returns list of [playerId, kind] for pickups that happened.
   */
  checkPickups(
    players: Map<string, { pos: Vec3; playerId: string; activePowerup: PowerupKind | null }>,
    now: number,
  ): Array<{ playerId: string; kind: PowerupKind; spawnId: string }> {
    const pickups: Array<{ playerId: string; kind: PowerupKind; spawnId: string }> = [];

    for (const spawn of this.spawns.values()) {
      if (!spawn.available) continue;

      for (const player of players.values()) {
        // Only pick up if player doesn't already have a powerup
        if (player.activePowerup !== null) continue;

        if (dist2d(player.pos, spawn.pos) <= PICKUP_RADIUS_M) {
          pickups.push({ playerId: player.playerId, kind: spawn.kind, spawnId: spawn.id });
          // Mark as unavailable, schedule respawn
          spawn.available = false;
          spawn.respawn_at = now + POWERUP_RESPAWN_MS;
          spawn.kind = randKind(); // pick kind for next respawn
          break; // one player per spawn per tick
        }
      }
    }

    return pickups;
  }

  /** Respawn power-ups whose timer has elapsed */
  tickRespawns(now: number): void {
    for (const spawn of this.spawns.values()) {
      if (!spawn.available && spawn.respawn_at !== null && now >= spawn.respawn_at) {
        spawn.available = true;
        spawn.respawn_at = null;
      }
    }
  }

  /**
   * Activate a power-up for a player. Returns list of affected other players
   * (for EMP / time_warp broadcast).
   */
  activatePowerup(
    holderId: string,
    kind: PowerupKind,
    now: number,
    allPlayerIds: string[],
    playerPositions: Map<string, Vec3>,
  ): string[] {
    const durationMap: Record<PowerupKind, number> = {
      boost: POWERUP_BOOST_DURATION_MS,
      shield: POWERUP_SHIELD_DURATION_MS,
      emp: POWERUP_EMP_DURATION_MS,
      gravity_well: POWERUP_GRAVITY_WELL_DURATION_MS,
      time_warp: POWERUP_TIME_WARP_DURATION_MS,
    };

    this.effects.set(holderId, {
      kind,
      expiresAt: now + durationMap[kind],
      holderId,
    });

    const affected: string[] = [];
    const holderPos = playerPositions.get(holderId);

    if (kind === "emp" && holderPos) {
      // Hit all nearby enemies (not holder, not shielded)
      for (const pid of allPlayerIds) {
        if (pid === holderId) continue;
        const pos = playerPositions.get(pid);
        if (!pos) continue;
        if (dist2d(holderPos, pos) <= POWERUP_EMP_RADIUS_M) {
          if (!this.hasShield(pid, now)) {
            this.applyEmpToTarget(pid, now);
            affected.push(pid);
          }
        }
      }
    }

    if (kind === "time_warp" && holderPos) {
      // Slow nearby enemies
      for (const pid of allPlayerIds) {
        if (pid === holderId) continue;
        const pos = playerPositions.get(pid);
        if (!pos) continue;
        if (dist2d(holderPos, pos) <= POWERUP_TIME_WARP_RADIUS_M) {
          if (!this.hasShield(pid, now)) {
            this.slowedPlayers.set(pid, now + POWERUP_TIME_WARP_DURATION_MS);
            affected.push(pid);
          }
        }
      }
    }

    return affected;
  }

  /** Apply power-up effects to a car's physics input/state */
  applyEffects(
    playerId: string,
    input: { steering: number; throttle: number; brake: boolean; boost: boolean },
    now: number,
  ): { steering: number; throttle: number; brake: boolean; boost: boolean } {
    const effect = this.effects.get(playerId);
    let out = { ...input };

    // Boost effect: force boost on
    if (effect?.kind === "boost" && effect.expiresAt > now) {
      out.boost = true;
    }

    // EMP effect: negate controls
    if (this.isEmpAffected(playerId, now)) {
      out.steering = 0;
      out.throttle = 0;
      out.brake = false;
      out.boost = false;
    }

    // Time warp: slow throttle
    const slowExpiry = this.slowedPlayers.get(playerId);
    if (slowExpiry !== undefined && now < slowExpiry) {
      out.throttle *= POWERUP_TIME_WARP_SLOW_FACTOR;
      out.boost = false;
    }

    return out;
  }

  /** Get gravity well pull vector for a player (m/s² acceleration) */
  getGravityWellPull(
    playerId: string,
    playerPos: Vec3,
    now: number,
  ): { dx: number; dz: number } | null {
    // Delegate to version that takes player positions map
    // This version is only used when we can find the holder from effects
    for (const [holderId, effect] of this.effects) {
      if (effect.kind === "gravity_well" && effect.expiresAt > now && holderId !== playerId) {
        // We'd need holder's position — not available here; callers use the other variant
        void holderId;
      }
    }
    return null;
  }

  getGravityWellPullWithPositions(
    playerId: string,
    playerPos: Vec3,
    playerPositions: Map<string, Vec3>,
    now: number,
  ): { dx: number; dz: number } | null {
    for (const [holderId, effect] of this.effects) {
      if (effect.kind !== "gravity_well") continue;
      if (effect.expiresAt <= now) continue;
      if (holderId === playerId) continue;

      const holderPos = playerPositions.get(holderId);
      if (!holderPos) continue;

      const d = dist2d(playerPos, holderPos);
      if (d > POWERUP_GRAVITY_WELL_RADIUS_M || d < 0.1) continue;

      // Pull toward holder
      const pull = POWERUP_GRAVITY_WELL_PULL * (1 - d / POWERUP_GRAVITY_WELL_RADIUS_M);
      const dx = (holderPos.x - playerPos.x) / d;
      const dz = (holderPos.z - playerPos.z) / d;
      return { dx: dx * pull, dz: dz * pull };
    }
    return null;
  }

  /** Expire effects whose timer ran out */
  tickEffects(now: number): string[] {
    const expired: string[] = [];
    for (const [pid, effect] of this.effects) {
      if (now >= effect.expiresAt) {
        this.effects.delete(pid);
        expired.push(pid);
      }
    }
    // Expire time-warp slow
    for (const [pid, expiresAt] of this.slowedPlayers) {
      if (now >= expiresAt) {
        this.slowedPlayers.delete(pid);
      }
    }
    return expired;
  }

  /** Check if player has an active shield */
  hasShield(playerId: string, now: number): boolean {
    const e = this.effects.get(playerId);
    return e?.kind === "shield" && e.expiresAt > now;
  }

  /** Get active powerup kind for a player (for state broadcast) */
  getActivePowerup(playerId: string, now: number): PowerupKind | null {
    const e = this.effects.get(playerId);
    if (e && e.expiresAt > now) return e.kind;
    return null;
  }

  /** Cleanup all state */
  reset(): void {
    this.effects.clear();
    this.slowedPlayers.clear();
    for (const spawn of this.spawns.values()) {
      spawn.available = true;
      spawn.respawn_at = null;
      spawn.kind = randKind();
    }
  }

  private isEmpAffected(playerId: string, now: number): boolean {
    const e = this.effects.get(playerId);
    return e?.kind === "emp" && e.expiresAt > now;
  }

  /** Apply EMP to a target player separately */
  applyEmpToTarget(targetId: string, now: number): void {
    this.effects.set(targetId, {
      kind: "emp",
      expiresAt: now + POWERUP_EMP_DURATION_MS,
    });
  }

  private anyActiveTimeWarp(now: number): boolean {
    for (const [, effect] of this.effects) {
      if (effect.kind === "time_warp" && effect.expiresAt > now) return true;
    }
    return false;
  }
}
