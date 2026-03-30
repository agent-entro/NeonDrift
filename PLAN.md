# NeonDrift — Technical Plan

### 3D Multiplayer Browser Racing Game

---

**Version:** 1.1 | **Date:** 2026-03-30 | **Status:** Phase 0 Complete — Phase 1A In Progress

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Entity Relations](#2-entity-relations)
3. [User Flows](#3-user-flows)
4. [MVP Implementation](#4-mvp-implementation)

---

## 1. Tech Stack

### Design Principles

Build over import. The stack favors lightweight primitives (Canvas, WebSocket, WebGPU, SQLite) over heavy frameworks with their own ecosystems. Small focused utilities are acceptable; large libraries with plugin systems, OAuth flows, or deep dependency trees are not. The dependency tree stays shallow — every dependency should be justifiable in one sentence.

---

### 1.1 Frontend

| Layer | Technology | Justification |
|---|---|---|
| **3D Engine** | **Babylon.js 7** (WebGPU primary, WebGL 2 fallback) | Only mature browser 3D engine with first-class WebGPU support. This *is* the rendering primitive — not a framework sitting on top of one. Includes Havok physics (WASM, off-main-thread). |
| **UI Layer** | **Vanilla TypeScript + CSS** | Menus, lobby, HUD overlays are simple DOM — a framework adds weight with no payoff. A thin ~200-line component helper (`h()`, `mount()`, `signal()`) replaces React for this use case. |
| **Build** | **Vite 6** | Fast HMR, native TS/ESM, asset pipeline (glTF, KTX2, Draco via plugins). No framework coupling. |
| **Routing** | **Custom hash router (~50 lines)** | Four routes total (`/`, `/r/:roomId`, `/watch/:roomId`, `/p/:username`). A library is overhead for four pattern matches. |
| **State** | **Custom signal/event system (~100 lines)** | Game state lives in typed classes with event emitters. UI state uses a minimal reactive signal primitive. No store library needed. |
| **Asset Format** | **glTF 2.0 + Draco mesh compression + KTX2 GPU textures** | Industry standard. Draco reduces mesh ~70%. KTX2 textures decode on GPU (no CPU stall). Both supported natively by Babylon.js loaders. |
| **Audio** | **Web Audio API (direct)** | Positional audio for engines/power-ups. The API is straightforward; a wrapper library adds indirection without value. ~150 lines for an `AudioManager` class. |
| **Networking** | **WebSocket (native browser API) + MessagePack (`msgpackr`)** | `msgpackr` is a single-file, zero-dependency binary encoder — 40–60% smaller than JSON. No WebRTC needed until Phase 3 voice chat. |

**Notable omissions (and why):**
- **No React/Vue/Svelte** — The UI is a lobby screen, a HUD overlay, and a results modal. These are thin DOM layers over a full-screen 3D canvas. A virtual DOM framework is architectural overhead.
- **No Tailwind** — With ~10 UI screens total, a utility CSS framework costs more in config and mental overhead than writing ~400 lines of vanilla CSS with custom properties.
- **No Howler.js** — Web Audio API is well-supported and the abstraction layer Howler provides (sprite sheets, format detection) isn't needed for engine hum + 3 SFX.

---

### 1.2 Backend

| Layer | Technology | Justification |
|---|---|---|
| **Runtime** | **Node.js 22 (LTS)** | Single language across stack. Native WebSocket support via `ws`. |
| **Game Server** | **Custom authoritative loop on `ws`** | A game room is ~300 lines: tick loop, state broadcast, input queue, reconciliation. Colyseus adds an ecosystem (schema DSL, matchmaker, monitor dashboard) we don't need and can't customize without fighting. |
| **Serialization** | **MessagePack (`msgpackr`)** | Same encoder client/server. Binary, fast, zero-config. |
| **HTTP API** | **Hono** | 14 KB, zero dependencies, runs on Node or edge. Handles room CRUD, leaderboards, battle pass state. Not an ecosystem — just a router with middleware. |
| **Database** | **SQLite via `better-sqlite3`** (dev/single-region) → **Turso (libSQL)** (multi-region prod) | SQLite is the simplest correct database. No connection pooling, no ORM, no hosted service. Turso gives SQLite replication to edge regions when needed. Queries are raw SQL with typed wrappers. |
| **Migrations** | **Plain `.sql` files + a 50-line runner** | A migration framework is overkill for <20 tables. Numbered SQL files (`001_create_rooms.sql`) applied in order. |
| **Session/Cache** | **In-memory `Map` + SQLite WAL** | Race sessions and matchmaking queues live in memory on the game server process. SQLite WAL mode handles concurrent reads for the API layer. No Redis needed at MVP scale (<10K CCU per region). |
| **File Storage** | **Local filesystem** (dev) → **Cloudflare R2** (prod) | Replay binaries and clan avatars. R2 has zero egress fees. A thin `Storage` interface abstracts the switch. |
| **Background Jobs** | **`setInterval` in-process** (dev) → **Cron trigger on deploy platform** (prod) | Replay TTL cleanup, season rotation, leaderboard snapshots. At MVP scale, an in-process timer is fine. |

**Notable omissions:**
- **No Colyseus** — Colyseus is a game server *framework* with its own schema system (`@colyseus/schema`), matchmaker service, load balancer, and monitoring dashboard. We need an authoritative game loop and delta broadcasting — that's ~500 lines of purpose-built code, not a framework.
- **No PostgreSQL** — At MVP scale (thousands of users, not millions), SQLite outperforms Postgres for read-heavy workloads, has zero ops burden, and the entire database is a single file you can back up with `cp`.
- **No Redis** — In-memory Maps on the game server process handle matchmaking queues and active sessions. SQLite handles persistent reads. Redis adds operational complexity (connection management, serialization edge cases) for a cache layer we don't yet need.
- **No Supabase** — Supabase bundles Postgres, auth, realtime, storage, and edge functions into a platform. We need a database and a file bucket — not a platform.

---

### 1.3 Hosting & Infrastructure

| Layer | Technology | Justification |
|---|---|---|
| **Frontend** | **Cloudflare Pages** | Global CDN, Git-triggered deploys, generous free tier. Static files only. |
| **Game Servers** | **Fly.io** (multi-region) | Deploy the Node.js game server close to players. Regions: `iad` (US-East), `ams` (EU-West), `sin` (Singapore), `gru` (Brazil). Fly's Anycast routes to nearest. |
| **API** | **Co-located with game server** (same Fly.io process) | At MVP, the HTTP API and game server share a process. Hono listens on the same port, different path prefix (`/api/*` vs WebSocket upgrade on `/ws/*`). Eliminates inter-service latency. |
| **CI/CD** | **GitHub Actions** | Lint → type-check → test → deploy. One workflow file. |
| **Monitoring** | **Sentry** (errors) + **Fly.io built-in metrics** | Sentry for crash reports. Fly's Grafana integration for CPU, memory, connections. No custom metrics infra at MVP. |
| **DNS** | **Cloudflare DNS** | Already using Pages; DNS in the same account simplifies cert management. |

---

### 1.4 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                          │
│                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │  DOM UI Layer     │     │   Babylon.js 3D Scene         │  │
│  │  (Vanilla TS)     │     │   WebGPU / WebGL 2            │  │
│  │  Lobby, HUD,      │     │   Havok Physics (WASM)        │  │
│  │  Results, Menus   │     │   Car models, Tracks, FX      │  │
│  └───────┬──────────┘     └─────────────┬────────────────┘  │
│          │    Signals / Events           │                    │
│          └──────────────┬───────────────┘                    │
│                         │                                    │
│              WebSocket (MessagePack binary frames)           │
└─────────────────────────┼────────────────────────────────────┘
                          │
        ┌─────────────────▼───────────────────┐
        │     Fly.io — Node.js Process         │
        │     (per-region: iad/ams/sin/gru)    │
        │                                      │
        │  ┌────────────────────────────────┐  │
        │  │  Game Server (ws)              │  │
        │  │  • 20Hz authoritative tick     │  │
        │  │  • Client prediction validate  │  │
        │  │  • Delta state broadcast       │  │
        │  │  • Room lifecycle mgmt         │  │
        │  │  • Matchmaking (in-memory)     │  │
        │  └────────────────────────────────┘  │
        │                                      │
        │  ┌────────────────────────────────┐  │
        │  │  HTTP API (Hono)               │  │
        │  │  • Room CRUD                   │  │
        │  │  • Leaderboard queries         │  │
        │  │  • Battle pass state           │  │
        │  │  • Replay URLs                 │  │
        │  └────────────┬───────────────────┘  │
        │               │                      │
        │  ┌────────────▼───────────────────┐  │
        │  │  SQLite (better-sqlite3)       │  │
        │  │  • Users, stats, seasons       │  │
        │  │  • Leaderboard, clans          │  │
        │  │  • Battle pass progress        │  │
        │  │  WAL mode for concurrent reads │  │
        │  └────────────────────────────────┘  │
        └──────────────────────────────────────┘
                          │
               ┌──────────▼──────────┐
               │  Cloudflare R2      │
               │  • Race replays     │
               │  • Clan avatars     │
               │  • Track thumbnails │
               └─────────────────────┘
```

---

## 2. Entity Relations

### 2.1 Core Entities

```
┌──────────────┐       ┌───────────────┐       ┌──────────────┐
│   players     │       │   rooms        │       │   races       │
├──────────────┤       ├───────────────┤       ├──────────────┤
│ id TEXT PK    │──┐    │ id TEXT PK     │──┐    │ id TEXT PK    │
│ display_name  │  │    │ slug TEXT UQ   │  │    │ room_id FK    │──→ rooms.id
│ session_token │  │    │ track_id FK    │──│──→ │ track_id FK   │──→ tracks.id
│ elo_rating    │  │    │ host_player FK │──│──→ │ status TEXT   │
│ xp_total INT  │  │    │ privacy TEXT   │  │    │ started_at    │
│ xp_season INT │  │    │ max_players    │  │    │ finished_at   │
│ created_at    │  │    │ status TEXT    │  │    │ replay_key    │
│ last_seen_at  │  │    │ created_at     │  │    │ created_at    │
└──────────────┘  │    │ expires_at     │  │    └──────────────┘
                  │    └───────────────┘  │           │
                  │                       │           │
                  │    ┌───────────────┐  │    ┌──────▼───────┐
                  │    │   tracks       │  │    │ race_results  │
                  │    ├───────────────┤  │    ├──────────────┤
                  │    │ id TEXT PK     │  │    │ id TEXT PK    │
                  │    │ name TEXT      │  │    │ race_id FK    │──→ races.id
                  │    │ slug TEXT UQ   │  │    │ player_id FK  │──→ players.id
                  │    │ asset_path     │  │    │ position INT  │
                  │    │ lap_count INT  │  │    │ total_time_ms │
                  │    │ difficulty     │  │    │ best_lap_ms   │
                  │    │ is_active BOOL │  │    │ xp_earned INT │
                  │    └───────────────┘  │    │ powerups_used │
                  │                       │    └──────────────┘
                  │                       │
                  │    ┌───────────────┐  │    ┌──────────────┐
                  └──→ │ room_players   │←─┘    │  seasons      │
                       ├───────────────┤       ├──────────────┤
                       │ room_id FK    │       │ id TEXT PK    │
                       │ player_id FK  │       │ number INT UQ │
                       │ slot INT      │       │ name TEXT     │
                       │ is_ready BOOL │       │ starts_at     │
                       │ joined_at     │       │ ends_at       │
                       └───────────────┘       │ is_active BOOL│
                                               └──────────────┘
                                                      │
┌──────────────┐       ┌───────────────┐              │
│   clans       │       │ battle_pass    │              │
├──────────────┤       ├───────────────┤              │
│ id TEXT PK    │       │ id TEXT PK     │              │
│ name TEXT UQ  │       │ player_id FK   │──→ players.id│
│ tag TEXT UQ   │       │ season_id FK   │──────────────┘
│ leader_id FK  │──→    │ tier INT       │
│ xp_total INT  │       │ xp_current INT │
│ created_at    │       │ is_premium BOOL│
└──────────────┘       │ purchased_at   │
       │               └───────────────┘
       │
┌──────▼───────┐       ┌───────────────┐
│ clan_members  │       │ cosmetics      │
├──────────────┤       ├───────────────┤
│ clan_id FK   │       │ id TEXT PK     │
│ player_id FK │       │ type TEXT      │  (decal, trail, horn, body)
│ role TEXT     │       │ name TEXT      │
│ joined_at    │       │ asset_path     │
└──────────────┘       │ season_id FK   │  (nullable — permanent items)
                       │ tier_required  │
                       │ is_premium BOOL│
                       └───────────────┘
                              │
                       ┌──────▼────────┐
                       │player_cosmetics│
                       ├───────────────┤
                       │ player_id FK   │
                       │ cosmetic_id FK │
                       │ is_equipped    │
                       │ unlocked_at    │
                       └───────────────┘
```

### 2.2 Entity Definitions (SQL)

```sql
-- 001_create_players.sql
CREATE TABLE players (
    id            TEXT PRIMARY KEY,  -- nanoid
    display_name  TEXT NOT NULL CHECK(length(display_name) BETWEEN 3 AND 20),
    session_token TEXT NOT NULL UNIQUE,
    elo_rating    INTEGER NOT NULL DEFAULT 1000,
    xp_total      INTEGER NOT NULL DEFAULT 0,
    xp_season     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 002_create_tracks.sql
CREATE TABLE tracks (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    asset_path  TEXT NOT NULL,
    lap_count   INTEGER NOT NULL DEFAULT 3,
    difficulty  TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
    is_active   INTEGER NOT NULL DEFAULT 1
);

-- 003_create_rooms.sql
CREATE TABLE rooms (
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

-- 004_create_room_players.sql
CREATE TABLE room_players (
    room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id  TEXT NOT NULL REFERENCES players(id),
    slot       INTEGER NOT NULL,
    is_ready   INTEGER NOT NULL DEFAULT 0,
    joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (room_id, player_id)
);

-- 005_create_races.sql
CREATE TABLE races (
    id          TEXT PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id),
    track_id    TEXT NOT NULL REFERENCES tracks(id),
    status      TEXT NOT NULL DEFAULT 'countdown' CHECK(status IN ('countdown','active','finished')),
    started_at  TEXT,
    finished_at TEXT,
    replay_key  TEXT,  -- R2 object key for replay binary
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 006_create_race_results.sql
CREATE TABLE race_results (
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

-- 007_create_seasons.sql
CREATE TABLE seasons (
    id        TEXT PRIMARY KEY,
    number    INTEGER NOT NULL UNIQUE,
    name      TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at   TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0
);

-- 008_create_battle_pass.sql
CREATE TABLE battle_pass (
    id           TEXT PRIMARY KEY,
    player_id    TEXT NOT NULL REFERENCES players(id),
    season_id    TEXT NOT NULL REFERENCES seasons(id),
    tier         INTEGER NOT NULL DEFAULT 0,
    xp_current   INTEGER NOT NULL DEFAULT 0,
    is_premium   INTEGER NOT NULL DEFAULT 0,
    purchased_at TEXT,
    UNIQUE(player_id, season_id)
);

-- 009_create_cosmetics.sql
CREATE TABLE cosmetics (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL CHECK(type IN ('decal','trail','horn','body','emote')),
    name          TEXT NOT NULL,
    asset_path    TEXT NOT NULL,
    season_id     TEXT REFERENCES seasons(id),  -- NULL = permanent
    tier_required INTEGER NOT NULL DEFAULT 0,
    is_premium    INTEGER NOT NULL DEFAULT 0
);

-- 010_create_player_cosmetics.sql
CREATE TABLE player_cosmetics (
    player_id   TEXT NOT NULL REFERENCES players(id),
    cosmetic_id TEXT NOT NULL REFERENCES cosmetics(id),
    is_equipped  INTEGER NOT NULL DEFAULT 0,
    unlocked_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (player_id, cosmetic_id)
);

-- 011_create_clans.sql
CREATE TABLE clans (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL UNIQUE,
    tag       TEXT NOT NULL UNIQUE CHECK(length(tag) BETWEEN 2 AND 5),
    leader_id TEXT NOT NULL REFERENCES players(id),
    xp_total  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 012_create_clan_members.sql
CREATE TABLE clan_members (
    clan_id   TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id),
    role      TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('leader','officer','member')),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (clan_id, player_id)
);

-- 013_create_indexes.sql
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_slug ON rooms(slug);
CREATE INDEX idx_races_room ON races(room_id);
CREATE INDEX idx_race_results_race ON race_results(race_id);
CREATE INDEX idx_race_results_player ON race_results(player_id);
CREATE INDEX idx_battle_pass_player_season ON battle_pass(player_id, season_id);
CREATE INDEX idx_players_elo ON players(elo_rating);
CREATE INDEX idx_players_xp_season ON players(xp_season DESC);
```

### 2.3 Key Relationships Summary

| Relationship | Type | Constraint |
|---|---|---|
| Player → Room | Many-to-Many | via `room_players` join table |
| Room → Track | Many-to-One | Each room plays one track |
| Room → Race | One-to-Many | A room can host sequential races |
| Race → Race Result | One-to-Many | One result row per player per race |
| Player → Battle Pass | One per season | Unique on `(player_id, season_id)` |
| Player → Cosmetic | Many-to-Many | via `player_cosmetics`, tracks equipped state |
| Clan → Player | One-to-Many | via `clan_members`, max 20 enforced in app logic |
| Season → Cosmetic | One-to-Many | Nullable FK; permanent items have no season |

---

## 3. User Flows

### 3.1 Flow: Anonymous First Play (Mobile — Critical Path)

This is the most important flow. It must work in **under 30 seconds** from link tap to race start.

```
Step  Action                              System Behavior
────  ────────────────────────────────────  ──────────────────────────────────────────
 1    Player receives invite link          e.g., neondrift.gg/r/neon-fox-491
      (WhatsApp / Discord / SMS)

 2    Taps link                            Browser opens. Cloudflare Pages serves
                                           index.html with inline CSS spinner
                                           (no blank flash). Vite-bundled JS loads.

 3    Asset loading                        Progressive: core engine + UI (~300KB gz)
                                           loads first. 3D track assets stream in
                                           background via glTF + Draco + KTX2.
                                           Target: interactive in <3s on 4G.

 4    Name entry modal appears             "Enter your racer name:" input.
                                           3–20 chars, alphanumeric + spaces.
                                           No account creation. No email.

 5    Player types name, taps JOIN         Client sends HTTP POST /api/rooms/:slug/join
                                           → Server creates player row (if new) with
                                           session_token, stores in HttpOnly cookie.
                                           → Server adds room_players entry.
                                           → Server returns room state + WebSocket URL.

 6    WebSocket connects                   Client opens WS to /ws/:roomId.
                                           Authenticates via session_token in first msg.
                                           Server sends current room state (players,
                                           ready states, track info).

 7    Lobby screen renders                 3D track preview rotates in background.
                                           Player list shows slots (1–8).
                                           Ready button visible. Countdown if ≥2 ready.

 8    Player taps READY                    WS message: { type: "ready" }
                                           Server broadcasts updated ready states.

 9    All ready OR 30s timer               Server sends { type: "countdown", t: 3 }
                                           Client shows 3-2-1 overlay.

10    Race starts                          Server begins 20Hz tick loop.
                                           Client starts local physics simulation.
                                           HUD appears: position, lap, minimap, boost.

11    Race runs (3 laps, ~4 min)           Client sends inputs at 20Hz.
                                           Server validates, broadcasts deltas.
                                           Client-side prediction hides latency.

12    Race ends                            Server sends final standings.
                                           Results screen: position, times, XP earned.
                                           Buttons: [RACE AGAIN] [SHARE REPLAY]

13    Player taps SHARE REPLAY             Client calls POST /api/races/:id/replay
                                           → Returns shareable URL. Opens native
                                           share sheet (navigator.share API).
```

**Error states handled:**
- Step 3: If assets fail to load, show retry button (not blank screen)
- Step 6: If WS fails to connect, retry 3x with exponential backoff, then show "connection failed" with manual retry
- Step 11: If WS drops mid-race, 10s grace window — car drives straight, player can reconnect without losing position
- Step 11: If player's tab loses focus (mobile), reduce tick rate to 5Hz to save battery; resume on focus

---

### 3.2 Flow: Create Custom Room (Desktop)

```
Step  Action                              System Behavior
────  ────────────────────────────────────  ──────────────────────────────────────────
 1    Player visits neondrift.gg           Landing page loads. Animated 3D hero
                                           (car drifting on neon track in Babylon.js).

 2    Clicks [CREATE ROOM]                 Modal opens with room settings:
                                           • Room name (pre-filled: "Blazing Iguana")
                                           • Track: dropdown (3 MVP tracks)
                                           • Privacy: Public / Invite Only
                                           • Max players: 4 / 6 / 8

 3    Clicks [CREATE]                      POST /api/rooms → returns { slug, roomId }.
                                           Player auto-created (or session restored
                                           from cookie). Redirects to /r/:slug.

 4    Lobby loads                          Player is host (gold crown icon).
                                           Copy URL button prominent.
                                           [START RACE] button (disabled until 2+ ready).

 5    Host shares URL → friends join       Each join triggers WS broadcast:
                                           { type: "player_joined", player: {...} }
                                           Lobby list updates live.

 6    Host clicks START                    Requires ≥2 players ready.
                                           Same countdown + race flow as 3.1 steps 9–13.
```

---

### 3.3 Flow: Quick Play (Matchmaking)

```
Step  Action                              System Behavior
────  ────────────────────────────────────  ──────────────────────────────────────────
 1    Player clicks [QUICK PLAY]           POST /api/matchmaking/join
                                           → Server adds player to in-memory queue,
                                           bucketed by ELO bracket (±200) and region.

 2    Waiting screen                       "Finding opponents... 3/8"
                                           Live counter updates via WS.
                                           Cancel button available.

 3    Match found (8 players OR 30s)       Server creates room, assigns all queued
                                           players. Random track selection.
                                           WS message: { type: "match_found", roomId }

 4    Auto-redirect to lobby               All players land in lobby simultaneously.
                                           5s auto-start countdown (no ready-check
                                           needed — matchmaking implies intent).

 5    Race runs                            Standard race flow (3.1 steps 10–13).
```

**Matchmaking algorithm (MVP — simple):**
```
Queue: Map<region, Map<eloBracket, Player[]>>
Every 2 seconds:
  For each region:
    For each bracket:
      If queue.length >= 8 → create room with 8 players
      If queue.length >= 2 AND oldest player waiting > 30s → create room
      If queue.length >= 2 AND oldest player waiting > 45s → merge with adjacent bracket
```

---

### 3.4 Flow: Spectator Mode

```
Step  Action                              System Behavior
────  ────────────────────────────────────  ──────────────────────────────────────────
 1    User opens room link mid-race        GET /api/rooms/:slug → status: "racing"

 2    Modal: "Race in progress"            [SPECTATE] [WAIT FOR NEXT RACE]

 3    User clicks SPECTATE                 WS connects in spectator mode (read-only).
                                           Server streams same delta state, no input
                                           accepted. No player slot consumed.

 4    Spectator view                       3D race loads. Camera follows race leader.
                                           Dropdown: select any racer to follow.
                                           Position ticker: "Priya overtook DriftKing!"

 5    Race ends                            Spectator sees results. Option: [JOIN NEXT]
```

---

### 3.5 Flow: Battle Pass Progression

```
Step  Action                              System Behavior
────  ────────────────────────────────────  ──────────────────────────────────────────
 1    Race ends → XP calculated            Base: 50 XP. Position bonus: 1st=100,
                                           2nd=70, 3rd=50, 4th–8th=20.
                                           First race of day: +50 bonus.
                                           Hot streak (3 wins): +100 bonus.

 2    XP added to battle pass              UPDATE battle_pass SET xp_current = xp_current + :xp
                                           Check if xp_current >= threshold for next tier.

 3    Tier unlocked → animation            Results screen shows unlock animation:
                                           cosmetic item spins into view, particles, SFX.
                                           [EQUIP NOW] [CONTINUE]

 4    Equip cosmetic                       UPDATE player_cosmetics SET is_equipped = 1
                                           3D car preview updates in real-time.
```

**XP thresholds per tier (30 tiers):**
```
Tier 1–10:   200 XP each  (cumulative: 2,000)
Tier 11–20:  350 XP each  (cumulative: 5,500)
Tier 21–30:  500 XP each  (cumulative: 10,500)
```
At ~150 XP/race, a player completes the free pass in ~70 races (~35 sessions of 2 races each, ~5 weeks of daily play). This aligns with the 6-week season length.

---

## 4. MVP Implementation

### 4.1 MVP Scope Definition

The MVP proves one hypothesis: **"Players will race strangers in a browser with zero install and come back to do it again."**

Everything not required to test that hypothesis is deferred.

#### In MVP (Phase 1)
| Feature | Justification |
|---|---|
| Instant room creation via URL | Core value prop — zero friction |
| 3 playable tracks | Minimum variety for replayability |
| 8-player real-time racing | Core multiplayer experience |
| Arcade physics (drift, boost) | Fun factor — the game must *feel* good |
| 3 power-ups (boost, shield, EMP) | Strategic depth without complexity |
| Mobile controls (joystick + tilt) | 67% of sessions are mobile |
| Desktop controls (WASD + gamepad) | Secondary audience |
| Client-prediction netcode | Non-negotiable for playability >50ms ping |
| Anonymous play (display name only) | Zero-friction entry |
| Post-race results screen | Closure for the session loop |
| One-click replay sharing | Viral growth loop |
| Basic matchmaking (ELO-lite) | Solo players need opponents |
| Spectator mode (read-only) | Viral growth loop + social |

#### Deferred to Phase 2
| Feature | Reason for deferral |
|---|---|
| User accounts (email/Google) | Anonymous play sufficient for validation |
| Battle pass / seasons | Requires retention data to calibrate |
| Leaderboards | Needs account persistence |
| Clans | Social features need a user base first |
| Cosmetic shop | Monetization after product-market fit |
| Track editor | Significant engineering; post-validation |
| Text/voice chat | Moderation burden |

---

### 4.2 Phased Implementation Plan

#### Phase 0: Project Scaffolding (Days 1–3) ✓ COMPLETE

**Goal:** Runnable dev environment with build pipeline, hot reload, and deploy target.

**Deliverables:**
- [x] Monorepo structure: `packages/client`, `packages/server`, `packages/shared`
- [x] `packages/shared`: TypeScript types for all wire messages (MessagePack schemas), game constants, entity types
- [x] `packages/server`: Node.js + Hono HTTP + `ws` WebSocket, SQLite via `better-sqlite3`
- [x] `packages/client`: Vite 6 + Babylon.js 7 bootstrapped, empty 3D scene renders
- [x] Migration runner + initial SQL migrations (players, rooms, tracks, room_players)
- [x] Docker Compose for local dev (just the Node server — SQLite needs no container)
- [x] GitHub Actions CI: lint + type-check + test (Vitest)
- [x] Cloudflare Pages deploy for client, Fly.io deploy for server
- [x] Inline CSS spinner in `index.html` (no blank flash)

**Key files:**
```
neondrift/
├── packages/
│   ├── client/
│   │   ├── src/
│   │   │   ├── main.ts              # Entry point
│   │   │   ├── engine/              # Babylon.js scene setup
│   │   │   ├── ui/                  # Vanilla TS DOM components
│   │   │   ├── net/                 # WebSocket client + msgpack
│   │   │   ├── input/               # Touch, keyboard, gamepad handlers
│   │   │   └── audio/               # Web Audio manager
│   │   ├── public/
│   │   │   └── assets/              # glTF models, KTX2 textures, audio
│   │   ├── index.html
│   │   └── vite.config.ts
│   ├── server/
│   │   ├── src/
│   │   │   ├── main.ts              # Entry: Hono + ws on same port
│   │   │   ├── api/                 # Hono route handlers
│   │   │   ├── game/                # Game loop, room manager, physics validator
│   │   │   ├── matchmaking/         # Queue + bracket logic
│   │   │   ├── db/                  # SQLite queries (raw SQL, typed wrappers)
│   │   │   └── migrations/          # Numbered .sql files
│   │   └── tsconfig.json
│   └── shared/
│       └── src/
│           ├── messages.ts          # MessagePack wire types
│           ├── constants.ts         # Tick rate, max players, XP tables
│           └── types.ts             # Entity types
├── .github/workflows/ci.yml
├── package.json                     # Workspace root
└── tsconfig.base.json
```

---

#### Phase 1A: 3D Track & Car (Days 4–8)

**Goal:** A single car drives around a single track with correct physics, camera, and controls. No multiplayer yet — local only.

**Deliverables:**
- [x] Babylon.js scene: neon-lit track (City Canyon), skybox, post-processing (bloom, chromatic aberration)
- [x] Car model loads from glTF. Placeholder geometry acceptable for first pass.
- [x] Arcade car physics using Havok:
  - Steering with drift (oversteer on turn + throttle)
  - Speed boost (temporary velocity multiplier)
  - Collision with track walls (bounce, not stop)
  - Gravity + ramps (airtime feels right)
  - Off-track detection → auto-respawn after 3s
- [x] Camera: chase cam (smooth follow behind car), orbit on results screen
- [x] Input handlers:
  - Mobile: virtual joystick (left thumb), brake button (right thumb), tilt steering option
  - Desktop: WASD / arrow keys, space = boost
  - Gamepad: left stick + triggers + A button
  - Input scheme stored in localStorage
- [x] HUD overlay (vanilla DOM, positioned over canvas):
  - Speed indicator
  - Lap counter (1/3, 2/3, 3/3)
  - Boost meter (fills over time, depletes on use)
  - Race position (placeholder — always shows "1st" until multiplayer)
- [ ] Minimap: top-down SVG of track outline + car dot
- [ ] Lap timing: start/finish line detection, per-lap time tracking
- [ ] Race completion: 3 laps → results screen with times

**Physics tuning budget:** Reserve 2 days. Arcade physics that *feel* good (responsive, forgiving, satisfying drift) is the single most important factor for retention. Do not ship until test players say "this feels fun."

---

#### Phase 1B: Multiplayer Netcode (Days 9–14)

**Goal:** 8 players race simultaneously with <100ms perceived latency. This is the hardest engineering challenge in the project.

**Deliverables:**
- [ ] **WebSocket game protocol** (MessagePack binary):
  ```
  Client → Server:
    { type: "input", tick: u32, steering: f32, throttle: f32, brake: bool, boost: bool }

  Server → Client:
    { type: "state", tick: u32, players: [{ id, pos: [x,y,z], rot: [x,y,z,w], vel: [x,y,z], lap, powerup }] }
    { type: "event", kind: "powerup_used"|"lap_complete"|"respawn"|"finish", data: {...} }
  ```
- [ ] **Server authoritative game loop** (20Hz / 50ms tick):
  - Receive input buffer from each client
  - Step physics simulation (server-side Havok or simplified physics model)
  - Validate positions (anti-cheat: reject teleports, speed hacks)
  - Broadcast delta-compressed state to all clients
- [ ] **Client-side prediction:**
  - Apply local input immediately (zero perceived latency)
  - On receiving server state: compare predicted vs authoritative
  - If divergence > threshold: smoothly interpolate toward server state over 100ms (no snap)
- [ ] **Delta compression:**
  - Only send changed fields per player per tick
  - Position quantized to 0.01m precision (16-bit per axis)
  - Rotation sent as compressed quaternion (smallest-three encoding, 6 bytes)
  - Target: ~8 KB/s per player at 20Hz with 8 players
- [ ] **Interpolation for remote players:**
  - Buffer 2 server ticks (~100ms)
  - Interpolate remote car positions between buffered states
  - Smooth, no jitter, even at 100ms ping
- [ ] **Reconnection:**
  - Server keeps player slot for 10s on disconnect
  - Car drives straight at last velocity
  - Client reconnects → receives full state → resumes
- [ ] **Room lifecycle on server:**
  - Room created → lobby state → countdown → racing → finished → cleanup
  - Max 30 rooms per server process (profiled, adjust based on CPU)
  - Room expires 5 min after last player leaves

---

#### Phase 1C: Rooms, Matchmaking & Lobby (Days 15–19)

**Goal:** Players can create rooms, share links, join via matchmaking, and see each other in a lobby.

**Deliverables:**
- [ ] **Landing page** (`/`):
  - 3D hero animation (car drifting, Babylon.js)
  - [CREATE ROOM] → room settings modal
  - [QUICK PLAY] → matchmaking queue
  - Minimal copy: tagline, 3 feature bullets, no scroll
- [ ] **Room creation API** (`POST /api/rooms`):
  - Generate slug (adjective-noun-number: "blazing-iguana-7")
  - Create room + player rows in SQLite
  - Return slug + session token
  - Rate limit: 10 rooms/hour per IP (in-memory counter)
- [ ] **Room join API** (`POST /api/rooms/:slug/join`):
  - Validate room exists, not full, not expired
  - Create player (or restore from session token cookie)
  - Return room state + WS endpoint
- [ ] **Lobby UI** (`/r/:slug`):
  - 3D track preview (slow rotate)
  - Player list (slots 1–8, shows name + ready state)
  - Ready button (green toggle)
  - Host controls: [START RACE] (enabled when ≥2 ready)
  - Copy link button (clipboard API)
  - 30s auto-start timer when ≥2 players and room is public
- [ ] **Matchmaking** (`POST /api/matchmaking/join`):
  - In-memory queue, bucketed by region (derived from Fly.io region header)
  - ELO brackets: 0–800, 800–1200, 1200–1600, 1600+
  - Fill to 8 or timeout at 30s (create room with available players)
  - Bracket relaxation at 45s (merge adjacent brackets)
  - Cancel endpoint: `DELETE /api/matchmaking`
- [ ] **Spectator mode**:
  - If room status is "racing", show [SPECTATE] option
  - WS connects in read-only mode (no input accepted, no slot consumed)
  - Camera follows race leader by default; dropdown to select any racer

---

#### Phase 1D: Power-ups, Polish & Replay (Days 20–25)

**Goal:** The game is fun, shareable, and launch-ready.

**Deliverables:**
- [ ] **3 power-ups:**
  - **Speed Boost**: 2s of 1.5x speed. Spawns on track as glowing orbs.
  - **Shield**: 3s invulnerability to EMP. Visual: hexagonal shell around car.
  - **EMP Pulse**: Slows all cars within 30m radius for 1.5s. Visual: expanding ring.
  - Spawn system: fixed positions on track, respawn 15s after pickup
  - Server validates all power-up usage (anti-cheat)
- [ ] **3 tracks fully built:**
  - City Canyon: urban neon, tight turns, 1 ramp
  - Orbital Loop: space station, wide sweeping curves, low gravity section
  - Crystal Caverns: underground, narrow passages, 2 shortcuts
- [ ] **Audio:**
  - Engine hum (pitch-shifted by speed)
  - Drift screech
  - Boost whoosh
  - Power-up pickup chime
  - EMP pulse
  - Countdown beeps (3-2-1-GO)
  - Finish line fanfare
- [ ] **Post-race results screen:**
  - Final standings (1st–8th) with names and total times
  - Best lap highlight
  - XP earned animation (store locally until accounts exist)
  - [RACE AGAIN] → re-queue in same room
  - [SHARE REPLAY] → generate replay URL
- [ ] **Replay system:**
  - Server records all position/rotation/event data per tick during race
  - Compress with MessagePack + gzip (~50KB for 4-min race)
  - Upload to R2 with 7-day TTL
  - Replay URL: `/watch/:replayId` — loads ghost playback, no live server needed
  - Camera: cinematic auto-switch or manual player follow
- [ ] **Mobile optimization pass:**
  - Test on Redmi Note 12, iPhone SE, Samsung A14
  - Reduce draw calls: LOD system, texture atlas, instanced rendering
  - Target: 30fps on mid-range Android, 60fps on iPhone 12+
  - Touch controls feel test: joystick dead zone, tilt sensitivity, brake responsiveness
- [ ] **Loading optimization:**
  - Progressive asset loading: UI-interactive first, 3D streams in background
  - Total initial download <2MB (compressed)
  - Track assets lazy-loaded per track (<3MB each, Draco + KTX2)
  - Show loading progress bar with percentage

---

#### Phase 1E: Launch Prep (Days 26–28)

**Goal:** Production-ready deployment with monitoring and basic security.

**Deliverables:**
- [ ] **Security hardening:**
  - Rate limiting on all public endpoints (in-memory, IP-based)
  - Display name sanitization (strip HTML/XML special chars server-side)
  - Session token as `HttpOnly` + `SameSite=Strict` cookie (not localStorage)
  - CSP headers via Hono middleware
  - Input validation on all API endpoints (max lengths, allowed characters)
- [ ] **Production deployment:**
  - Fly.io: 2 regions minimum (US-East, EU-West) for launch
  - Cloudflare Pages: production domain, SSL, caching headers
  - R2 bucket for replays with lifecycle policy (7-day auto-delete)
  - SQLite database backed up daily (Fly.io volume snapshot)
- [ ] **Monitoring:**
  - Sentry SDK on client + server (error tracking)
  - Custom game metrics logged to stdout (Fly.io Grafana):
    - CCU (concurrent users) per region
    - Rooms active
    - Median tick processing time
    - P95 client-reported latency
    - Race completion rate
  - Health endpoint: `GET /api/health` (DB + WS status)
- [ ] **SEO & social:**
  - `<html lang="en">` (WCAG 3.1.1)
  - OG tags + Twitter Card for landing page and replay URLs
  - `robots.txt`: allow `/`, disallow `/r/`, `/ws/`
  - Inline meta description + title
- [ ] **Launch checklist:**
  - [ ] 3 tracks playable with no crashes across 50 test races
  - [ ] 8-player race stable at 20Hz for 5 minutes
  - [ ] Mobile: 30fps on Redmi Note 12 (Android mid-range baseline)
  - [ ] Replay share works end-to-end
  - [ ] Matchmaking fills a room within 30s with 8 test players
  - [ ] Reconnection works (kill WS, rejoin within 10s)
  - [ ] No XSS in display name rendering
  - [ ] Rate limiting verified (hammer test)

---

### 4.3 API Surface (MVP)

```
REST Endpoints (Hono — co-located with game server on Fly.io)
────────────────────────────────────────────────────────────────

POST   /api/rooms                    → Create room { slug, track, privacy, maxPlayers }
GET    /api/rooms/:slug              → Room metadata { status, players, track }
POST   /api/rooms/:slug/join         → Join room { displayName } → { sessionToken, roomState }
DELETE /api/rooms/:slug/leave        → Leave room (explicit)
POST   /api/matchmaking/join         → Enter matchmaking queue → { queuePosition }
DELETE /api/matchmaking              → Cancel matchmaking
POST   /api/races/:id/replay        → Generate replay URL → { replayUrl }
GET    /api/health                   → Health check { db: ok, ws: ok, rooms: N }

WebSocket Protocol (/ws/:roomId) — MessagePack binary frames
────────────────────────────────────────────────────────────────

Client → Server:
  AUTH             { sessionToken }
  INPUT            { tick, steering, throttle, brake, boost }
  READY            {}
  START_RACE       {}  (host only)
  CHAT_EMOJI       { emojiId }  (post-race only, 5 preset reactions)

Server → Client:
  ROOM_STATE       { players[], track, status, hostId }
  PLAYER_JOINED    { player }
  PLAYER_LEFT      { playerId }
  PLAYER_READY     { playerId, isReady }
  COUNTDOWN        { seconds }
  GAME_STATE       { tick, players: [{ id, pos, rot, vel, lap, powerup }] }
  GAME_EVENT       { kind, data }  (powerup_used, lap_complete, respawn, finish)
  RACE_RESULTS     { standings: [{ playerId, position, totalTime, bestLap, xp }] }
  MATCH_FOUND      { roomId, slug }
  ERROR            { code, message }
```

---

### 4.4 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Arcade physics don't feel fun | Medium | Critical | Budget 2 extra days for tuning. Playtest with 5+ non-developers before Phase 1A signoff. Reference Mario Kart 8 / Burnout drift feel. |
| WebGPU not available on target mobile devices | Medium | High | Babylon.js falls back to WebGL 2 automatically. Test fallback path explicitly on Android Chrome and Samsung Internet. |
| 20Hz tick rate too expensive at 8 players × 30 rooms | Low | High | Profile early (Phase 1B). Fallback: reduce to 15Hz (still acceptable for arcade racing). Optimize: skip ticks for distant players. |
| SQLite single-writer bottleneck under load | Low | Medium | WAL mode handles concurrent reads. Writes are low-frequency (room create, race results). If bottleneck appears, batch writes with 100ms debounce. |
| Mid-range Android phones can't maintain 30fps | Medium | High | Aggressive LOD, texture downscaling, disable post-processing on low-end. Detect GPU tier at startup via `renderer` string from WebGL context. |
| Replay files too large for R2 free tier | Low | Low | 50KB/replay × 1000 races/day = 50MB/day. R2 free tier is 10GB. 200 days before concern. |

---

### 4.5 Success Criteria for MVP

The MVP is successful if, after 2 weeks of public availability:

| Metric | Target | Measurement |
|---|---|---|
| Players complete a race (don't quit mid-race) | >70% | `race_results` count vs `room_players` count |
| Players race again in same session | >40% | Sequential races by same session token |
| Replay links are shared | >10% of completed races | `replay_key IS NOT NULL` in races table |
| P95 in-race latency | <100ms | Client-reported metric to Sentry |
| Race load time (link tap → lobby) | <5s on 4G | Client-reported metric |
| Zero critical bugs in production | 0 Sentry P0s | Sentry dashboard |

If these targets are met, proceed to Phase 2 (accounts, battle pass, leaderboards, 3 more tracks).

---

*NeonDrift Technical Plan v1.0 — Ready for implementation.*
