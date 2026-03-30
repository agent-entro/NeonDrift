CREATE TABLE IF NOT EXISTS seasons (
    id        TEXT PRIMARY KEY,
    number    INTEGER NOT NULL UNIQUE,
    name      TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at   TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0
);
