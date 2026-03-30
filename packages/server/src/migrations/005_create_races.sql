CREATE TABLE IF NOT EXISTS races (
    id          TEXT PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id),
    track_id    TEXT NOT NULL REFERENCES tracks(id),
    status      TEXT NOT NULL DEFAULT 'countdown' CHECK(status IN ('countdown','active','finished')),
    started_at  TEXT,
    finished_at TEXT,
    replay_key  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_races_room ON races(room_id);
