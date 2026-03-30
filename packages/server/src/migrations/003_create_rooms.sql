CREATE TABLE IF NOT EXISTS rooms (
    id            TEXT PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    track_id      TEXT NOT NULL REFERENCES tracks(id),
    host_player   TEXT NOT NULL REFERENCES players(id),
    privacy       TEXT NOT NULL DEFAULT 'public' CHECK(privacy IN ('public','invite')),
    max_players   INTEGER NOT NULL DEFAULT 8 CHECK(max_players BETWEEN 2 AND 8),
    status        TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','racing','finished','expired')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_slug ON rooms(slug);
