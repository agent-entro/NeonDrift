// ─── Entity types (mirror DB rows, used on client + server) ─────────────────

export type PlayerPrivacy = "public" | "invite";
export type RoomStatus = "lobby" | "racing" | "finished" | "expired";
export type RaceStatus = "countdown" | "active" | "finished";
export type CosmeticType = "decal" | "trail" | "horn" | "body" | "emote";
export type ClanRole = "leader" | "officer" | "member";
export type TrackDifficulty = "easy" | "medium" | "hard";
export type PowerupKind = "boost" | "shield" | "emp" | "gravity_well" | "time_warp";

export interface Player {
  id: string;
  display_name: string;
  elo_rating: number;
  xp_total: number;
  xp_season: number;
  created_at: string;
  last_seen_at: string;
}

export interface Track {
  id: string;
  name: string;
  slug: string;
  asset_path: string;
  lap_count: number;
  difficulty: TrackDifficulty;
  is_active: boolean;
}

export interface Room {
  id: string;
  slug: string;
  track_id: string;
  host_player: string;
  privacy: PlayerPrivacy;
  max_players: number;
  status: RoomStatus;
  created_at: string;
  expires_at: string;
}

export interface RoomPlayer {
  room_id: string;
  player_id: string;
  slot: number;
  is_ready: boolean;
  joined_at: string;
}

export interface Race {
  id: string;
  room_id: string;
  track_id: string;
  status: RaceStatus;
  started_at: string | null;
  finished_at: string | null;
  replay_key: string | null;
  created_at: string;
}

export interface RaceResult {
  id: string;
  race_id: string;
  player_id: string;
  position: number;
  total_time_ms: number;
  best_lap_ms: number;
  xp_earned: number;
  powerups_used: number;
}

// ─── In-memory game state types ──────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface PlayerGameState {
  id: string;
  /** Position in world space */
  pos: Vec3;
  /** Rotation quaternion */
  rot: Quat;
  /** Velocity vector */
  vel: Vec3;
  /** Current lap (0-indexed) */
  lap: number;
  /** Active power-up or null */
  powerup: PowerupKind | null;
  /** Whether this player has finished */
  finished: boolean;
  /** Finish time in ms from race start */
  finish_time_ms: number | null;
}

export interface PowerupSpawn {
  id: string;
  kind: PowerupKind;
  pos: Vec3;
  /** Whether it's currently available for pickup */
  available: boolean;
  /** When it respawns (server timestamp) */
  respawn_at: number | null;
}
