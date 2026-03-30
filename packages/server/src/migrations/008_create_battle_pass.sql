CREATE TABLE IF NOT EXISTS battle_pass (
    id           TEXT PRIMARY KEY,
    player_id    TEXT NOT NULL REFERENCES players(id),
    season_id    TEXT NOT NULL REFERENCES seasons(id),
    tier         INTEGER NOT NULL DEFAULT 0,
    xp_current   INTEGER NOT NULL DEFAULT 0,
    is_premium   INTEGER NOT NULL DEFAULT 0,
    purchased_at TEXT,
    UNIQUE(player_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_battle_pass_player_season ON battle_pass(player_id, season_id);
