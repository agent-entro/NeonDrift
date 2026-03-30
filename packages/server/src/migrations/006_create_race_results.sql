CREATE TABLE IF NOT EXISTS race_results (
    id            TEXT PRIMARY KEY,
    race_id       TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    player_id     TEXT NOT NULL REFERENCES players(id),
    position      INTEGER NOT NULL,
    total_time_ms INTEGER NOT NULL,
    best_lap_ms   INTEGER NOT NULL,
    xp_earned     INTEGER NOT NULL DEFAULT 0,
    powerups_used INTEGER NOT NULL DEFAULT 0,
    UNIQUE(race_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_race_results_race ON race_results(race_id);
CREATE INDEX IF NOT EXISTS idx_race_results_player ON race_results(player_id);
