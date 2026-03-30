CREATE TABLE IF NOT EXISTS players (
    id            TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL CHECK(length(display_name) BETWEEN 3 AND 20),
    session_token TEXT NOT NULL UNIQUE,
    elo_rating    INTEGER NOT NULL DEFAULT 1000,
    xp_total      INTEGER NOT NULL DEFAULT 0,
    xp_season     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
