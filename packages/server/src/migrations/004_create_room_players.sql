CREATE TABLE IF NOT EXISTS room_players (
    room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id  TEXT NOT NULL REFERENCES players(id),
    slot       INTEGER NOT NULL,
    is_ready   INTEGER NOT NULL DEFAULT 0,
    joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (room_id, player_id)
);
