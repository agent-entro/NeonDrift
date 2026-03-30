CREATE TABLE IF NOT EXISTS tracks (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    asset_path  TEXT NOT NULL,
    lap_count   INTEGER NOT NULL DEFAULT 3,
    difficulty  TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
    is_active   INTEGER NOT NULL DEFAULT 1
);

-- Seed default tracks
INSERT OR IGNORE INTO tracks (id, name, slug, asset_path, lap_count, difficulty, is_active) VALUES
    ('track_city_canyon',  'City Canyon',    'city-canyon',   '/assets/tracks/city-canyon.glb',   3, 'medium', 1),
    ('track_orbital_loop', 'Orbital Loop',   'orbital-loop',  '/assets/tracks/orbital-loop.glb',  3, 'easy',   1),
    ('track_crystal_cave', 'Crystal Caverns','crystal-caverns','/assets/tracks/crystal-caverns.glb',3,'hard',  1);
