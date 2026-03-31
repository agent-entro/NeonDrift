# NeonDrift Project Plan

## Phase 0: Project Scaffolding
- Status: **Complete**
- Objective: Set up a runnable dev environment with build pipeline, hot reload, and deploy target.
- Key Deliverables:
    - Monorepo structure (`packages/client`, `packages/server`, `packages/shared`)
    - TypeScript types for all wire messages, game constants, and entity types
    - Node.js + Hono HTTP + WebSocket server with SQLite via `better-sqlite3`
    - Vite 6 + Babylon.js 7 bootstrapped with empty 3D scene rendering
    - Migration runner and initial SQL migrations
    - Docker Compose for local dev, GitHub Actions CI, Cloudflare Pages + Fly.io deploy targets

## Phase 1: Core Game Loop
- Status: **In Progress**
- Objective: Implement a fully playable single-player and multiplayer racing experience including 3D track & car physics, real-time netcode, rooms, matchmaking, power-ups, and launch readiness.
- Key Deliverables:
    - Babylon.js 3D scene with neon-lit tracks, car model, and Havok arcade physics (drift, boost, collision, respawn)
    - Camera system (chase cam, orbit), HUD overlay, minimap, lap timing, and race completion flow
    - Mobile (virtual joystick/tilt) and desktop (WASD/gamepad) input handlers
    - WebSocket game protocol (MessagePack binary), 20Hz authoritative server tick loop
    - Client-side prediction, delta compression, interpolation for remote players, and reconnection handling
    - Room creation/join APIs, lobby UI, matchmaking queue (ELO-bucketed, region-aware), and spectator mode
    - 3 power-ups (Speed Boost, Shield, EMP Pulse) with server-side validation
    - 3 fully built tracks (City Canyon, Orbital Loop, Crystal Caverns)
    - Audio: engine hum, drift screech, boost, power-up SFX, countdown, finish fanfare
    - Post-race results screen with XP animation, race-again flow, and replay share
    - Replay recording, compression, R2 upload, and ghost playback viewer
    - Mobile performance optimization (30fps on mid-range Android)
    - Security hardening, production deployment (Fly.io multi-region + Cloudflare Pages), and monitoring (Sentry + Grafana)

## Phase 2: Accounts, Progression & Social
- Status: **Pending**
- Objective: Introduce persistent user accounts, a seasonal battle pass with cosmetics, leaderboards, and clan systems to drive long-term retention.
- Key Deliverables:
    - User accounts (email / Google OAuth) with session persistence
    - Battle pass and season system (30 tiers, XP thresholds, premium track)
    - Cosmetic unlocks and equip system (decals, trails, horns, car bodies)
    - Global and regional leaderboards
    - Clan creation, membership, and clan XP tracking
    - Cosmetic shop and monetization infrastructure

## Phase 3: Content Expansion & Live Operations
- Status: **Pending**
- Objective: Expand track and content library, introduce advanced game modes, and establish live operations tooling for ongoing seasonal updates.
- Key Deliverables:
    - Additional tracks (3+ beyond MVP) including a track editor
    - Advanced game modes (elimination, time trial, clan wars)
    - Text and voice chat with moderation tooling
    - Live ops dashboard: season rotation, leaderboard snapshots, replay TTL management
    - Multi-region scaling (additional Fly.io regions), Turso (libSQL) for edge database replication
    - Community management and post-launch support infrastructure
