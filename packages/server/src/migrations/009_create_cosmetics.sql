CREATE TABLE IF NOT EXISTS cosmetics (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL CHECK(type IN ('decal','trail','horn','body','emote')),
    name          TEXT NOT NULL,
    asset_path    TEXT NOT NULL,
    season_id     TEXT REFERENCES seasons(id),
    tier_required INTEGER NOT NULL DEFAULT 0,
    is_premium    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_cosmetics (
    player_id   TEXT NOT NULL REFERENCES players(id),
    cosmetic_id TEXT NOT NULL REFERENCES cosmetics(id),
    is_equipped  INTEGER NOT NULL DEFAULT 0,
    unlocked_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (player_id, cosmetic_id)
);
