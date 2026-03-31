/** Server tick rate in Hz */
export const TICK_RATE = 20;
/** Milliseconds per server tick */
export const TICK_MS = 1000 / TICK_RATE;
/** Max players per room */
export const MAX_PLAYERS = 8;
/** Min players to start a race */
export const MIN_PLAYERS = 2;
/** Room expiry after last player leaves (ms) */
export const ROOM_EXPIRY_MS = 5 * 60 * 1000;
/** Lobby auto-start timer (ms) */
export const LOBBY_AUTO_START_MS = 30 * 1000;
/** Reconnect grace period (ms) */
export const RECONNECT_GRACE_MS = 10 * 1000;
/** Max rooms per server process */
export const MAX_ROOMS = 30;

// XP values
export const XP_BASE = 50;
export const XP_FIRST_RACE_BONUS = 50;
export const XP_HOT_STREAK_BONUS = 100; // 3 consecutive wins
export const XP_POSITION_BONUS: Record<number, number> = {
  1: 100,
  2: 70,
  3: 50,
};
export const XP_DEFAULT_POSITION_BONUS = 20;

// Battle pass XP thresholds (30 tiers)
export const XP_PER_TIER: number[] = [
  ...Array(10).fill(200), // tiers 1–10
  ...Array(10).fill(350), // tiers 11–20
  ...Array(10).fill(500), // tiers 21–30
];

// ELO brackets
export const ELO_BRACKETS = [
  { min: 0, max: 800 },
  { min: 800, max: 1200 },
  { min: 1200, max: 1600 },
  { min: 1600, max: Infinity },
];
export const ELO_DEFAULT = 1000;

// Matchmaking timeouts (ms)
export const MM_FILL_TIMEOUT_MS = 30_000;
export const MM_BRACKET_RELAX_MS = 45_000;

// Power-up durations (ms)
export const POWERUP_BOOST_DURATION_MS = 2000;
export const POWERUP_SHIELD_DURATION_MS = 3000;
export const POWERUP_EMP_DURATION_MS = 1500;
export const POWERUP_EMP_RADIUS_M = 30;
export const POWERUP_BOOST_MULTIPLIER = 1.5;
export const POWERUP_GRAVITY_WELL_DURATION_MS = 4000;
export const POWERUP_GRAVITY_WELL_RADIUS_M = 40;
export const POWERUP_GRAVITY_WELL_PULL = 15; // m/s² toward holder
export const POWERUP_TIME_WARP_DURATION_MS = 3000;
export const POWERUP_TIME_WARP_SLOW_FACTOR = 0.5; // affected players move at 50% speed
export const POWERUP_TIME_WARP_RADIUS_M = 50;
export const POWERUP_RESPAWN_MS = 15_000;
