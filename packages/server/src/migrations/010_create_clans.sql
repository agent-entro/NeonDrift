CREATE TABLE IF NOT EXISTS clans (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL UNIQUE,
    tag       TEXT NOT NULL UNIQUE CHECK(length(tag) BETWEEN 2 AND 5),
    leader_id TEXT NOT NULL REFERENCES players(id),
    xp_total  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clan_members (
    clan_id   TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id),
    role      TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('leader','officer','member')),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (clan_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_players_elo ON players(elo_rating);
CREATE INDEX IF NOT EXISTS idx_players_xp_season ON players(xp_season DESC);
