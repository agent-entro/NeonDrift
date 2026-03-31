import { describe, it, expect, beforeEach } from "vitest";
import { PowerupManager } from "../game/PowerupManager.js";
import type { Vec3 } from "@neondrift/shared";

const SPAWN_POINTS = [
  { x: 10, y: 0, z: 0 },
  { x: -10, y: 0, z: 0 },
  { x: 0, y: 0, z: 50 },
];

describe("PowerupManager", () => {
  let mgr: PowerupManager;
  const NOW = 1_000_000;

  beforeEach(() => {
    mgr = new PowerupManager(SPAWN_POINTS);
  });

  it("initializes with correct number of spawns", () => {
    const spawns = mgr.getSpawns();
    expect(spawns).toHaveLength(3);
    expect(spawns.every((s) => s.available)).toBe(true);
  });

  it("detects pickup when player is within radius", () => {
    const spawns = mgr.getSpawns();
    const firstSpawn = spawns[0];
    // Player right on top of spawn point
    const players = new Map([
      ["p1", { pos: { x: firstSpawn.pos.x, y: 0, z: firstSpawn.pos.z }, playerId: "p1", activePowerup: null }],
    ]);

    const pickups = mgr.checkPickups(players, NOW);
    expect(pickups).toHaveLength(1);
    expect(pickups[0].playerId).toBe("p1");
  });

  it("does not pick up when player already has a powerup", () => {
    const spawns = mgr.getSpawns();
    const firstSpawn = spawns[0];
    const players = new Map([
      ["p1", { pos: { ...firstSpawn.pos }, playerId: "p1", activePowerup: "boost" as const }],
    ]);
    const pickups = mgr.checkPickups(players, NOW);
    expect(pickups).toHaveLength(0);
  });

  it("does not pick up when player is far away", () => {
    const players = new Map([
      ["p1", { pos: { x: 1000, y: 0, z: 1000 }, playerId: "p1", activePowerup: null }],
    ]);
    const pickups = mgr.checkPickups(players, NOW);
    expect(pickups).toHaveLength(0);
  });

  it("marks spawn unavailable after pickup", () => {
    const spawns = mgr.getSpawns();
    const firstSpawn = spawns[0];
    const players = new Map([
      ["p1", { pos: { ...firstSpawn.pos }, playerId: "p1", activePowerup: null }],
    ]);
    mgr.checkPickups(players, NOW);
    const updated = mgr.getSpawns().find((s) => s.id === firstSpawn.id)!;
    expect(updated.available).toBe(false);
    expect(updated.respawn_at).toBe(NOW + 15_000);
  });

  it("respawns powerup after timer elapses", () => {
    const spawns = mgr.getSpawns();
    const firstSpawn = spawns[0];
    const players = new Map([
      ["p1", { pos: { ...firstSpawn.pos }, playerId: "p1", activePowerup: null }],
    ]);
    mgr.checkPickups(players, NOW);
    mgr.tickRespawns(NOW + 14_999);
    expect(mgr.getSpawns().find((s) => s.id === firstSpawn.id)!.available).toBe(false);
    mgr.tickRespawns(NOW + 15_001);
    expect(mgr.getSpawns().find((s) => s.id === firstSpawn.id)!.available).toBe(true);
  });

  it("activatePowerup: boost forces boost input", () => {
    mgr.activatePowerup("p1", "boost", NOW, ["p1"], new Map());
    const out = mgr.applyEffects("p1", { steering: 0, throttle: 0.5, brake: false, boost: false }, NOW + 100);
    expect(out.boost).toBe(true);
  });

  it("activatePowerup: EMP disables controls of nearby players", () => {
    const positions = new Map<string, Vec3>([
      ["attacker", { x: 0, y: 0, z: 0 }],
      ["victim", { x: 5, y: 0, z: 5 }],
    ]);
    const affected = mgr.activatePowerup("attacker", "emp", NOW, ["attacker", "victim"], positions);
    expect(affected).toContain("victim");

    const out = mgr.applyEffects("victim", { steering: 1, throttle: 1, brake: false, boost: true }, NOW + 100);
    expect(out.steering).toBe(0);
    expect(out.throttle).toBe(0);
    expect(out.boost).toBe(false);
  });

  it("activatePowerup: shield blocks EMP", () => {
    // Give victim a shield first
    mgr.activatePowerup("victim", "shield", NOW, [], new Map());
    const positions = new Map<string, Vec3>([
      ["attacker", { x: 0, y: 0, z: 0 }],
      ["victim", { x: 5, y: 0, z: 5 }],
    ]);
    const affected = mgr.activatePowerup("attacker", "emp", NOW, ["attacker", "victim"], positions);
    expect(affected).not.toContain("victim");
  });

  it("tickEffects removes expired effects", () => {
    mgr.activatePowerup("p1", "boost", NOW, [], new Map()); // 2000ms duration
    expect(mgr.getActivePowerup("p1", NOW + 100)).toBe("boost");
    const expired = mgr.tickEffects(NOW + 3000);
    expect(expired).toContain("p1");
    expect(mgr.getActivePowerup("p1", NOW + 3000)).toBeNull();
  });

  it("gravity well pulls nearby player toward holder", () => {
    const positions = new Map<string, Vec3>([
      ["holder", { x: 0, y: 0, z: 0 }],
      ["victim", { x: 20, y: 0, z: 0 }],
    ]);
    mgr.activatePowerup("holder", "gravity_well", NOW, ["holder", "victim"], positions);
    const pull = mgr.getGravityWellPullWithPositions("victim", { x: 20, y: 0, z: 0 }, positions, NOW + 100);
    expect(pull).not.toBeNull();
    // Should pull toward holder (negative x direction)
    expect(pull!.dx).toBeLessThan(0);
  });

  it("time_warp slows nearby players", () => {
    const positions = new Map<string, Vec3>([
      ["holder", { x: 0, y: 0, z: 0 }],
      ["victim", { x: 10, y: 0, z: 0 }],
    ]);
    mgr.activatePowerup("holder", "time_warp", NOW, ["holder", "victim"], positions);
    const out = mgr.applyEffects("victim", { steering: 0, throttle: 1, brake: false, boost: false }, NOW + 100);
    expect(out.throttle).toBeLessThan(1);
  });

  it("reset restores all spawns", () => {
    const spawns = mgr.getSpawns();
    const players = new Map([["p1", { pos: { ...spawns[0].pos }, playerId: "p1", activePowerup: null }]]);
    mgr.checkPickups(players, NOW);
    mgr.activatePowerup("p1", "boost", NOW, [], new Map());
    mgr.reset();
    expect(mgr.getSpawns().every((s) => s.available)).toBe(true);
    expect(mgr.getActivePowerup("p1", NOW + 100)).toBeNull();
  });
});
