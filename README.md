# NeonDrift 🏎️

A fast-paced 3D multiplayer browser racing game built with Babylon.js and WebSockets. Race against others in real-time on a neon-lit track — no plugins, no downloads, just open a tab and drive.

---

## Current State

**Implemented: Phase 0 (Scaffolding) + Phase 1 (Core Game Loop)**

- ✅ **Milestone 0** — Monorepo, TypeScript, Vite, SQLite, WebSocket server, Docker
- ✅ **Milestone 1.1** — 3D track, arcade car physics, minimap, lap timing, boost pads, post-processing
- ✅ **Milestone 1.2** — Multiplayer netcode: authoritative server, client-side prediction, state sync

The game is playable locally in multiplayer right now. Open two browser tabs to test.

Matchmaking, lobbies, power-ups, progression systems, and cosmetics are still in development (Phase 2+).

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 22+ | LTS recommended |
| [npm](https://npmjs.com/) | 10+ | bundled with Node.js |
| [Docker](https://docker.com/) + [Docker Compose](https://docs.docker.com/compose/) | any recent | for containerised server |

> **No Docker?** You can run the server directly with `npm run dev` — see [Running Without Docker](#option-b-without-docker) below.

---

## Local Setup

### 1. Clone

```bash
git clone git@github.com:agent-entro/NeonDrift.git
cd NeonDrift
```

### 2. Install dependencies

```bash
npm install
```

This installs deps for all three workspace packages (`shared`, `server`, `client`) in one shot.

### 3. Run the server

#### Option A: Docker Compose (recommended)

```bash
docker compose up --build
```

- Builds the server image, runs migrations automatically on first start
- SQLite data persists in a named Docker volume (`neondrift_data`)
- Server listens on **http://localhost:3001**
- Health check: `http://localhost:3001/health`

To stop: `Ctrl+C`, then `docker compose down`

#### Option B: Without Docker

Build and run the server directly:

```bash
# Build shared types first (server depends on them)
npm run build -w packages/shared

# Start the server in watch mode
npm run dev -w packages/server
```

The server will run migrations against a local SQLite file (`./data/neondrift.db` by default — set `DB_PATH` env var to override).

### 4. Run the client

In a separate terminal:

```bash
npm run dev -w packages/client
```

Vite starts a dev server, typically at **http://localhost:5173**.

Open that URL in your browser.

### 5. Test multiplayer

Open **two separate browser tabs** (or two different browsers) pointing at `http://localhost:5173`. Both clients connect to the local WebSocket server and race each other live.

---

## Environment Variables

The server reads these (all optional, sensible defaults shown):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP + WebSocket port |
| `DB_PATH` | `/app/data/neondrift.db` | Path to SQLite database file |
| `NODE_ENV` | `development` | `development` or `production` |

For local dev without Docker, you can set them inline:

```bash
DB_PATH=./local.db PORT=3001 npm run dev -w packages/server
```

---

## Key Features (Implemented)

### Rendering & Track
- Babylon.js 7 (WebGL2/WebGPU) — no canvas boilerplate, full 3D
- Procedural neon-lit racetrack with barriers and boost pads
- Post-processing pipeline (bloom, tone-mapping)

### Car Physics
- Arcade-style physics: responsive steering, drift, grip
- Boost mechanic triggered by driving over boost pads
- Camera tracks the car smoothly in third-person

### HUD
- Minimap showing all connected players
- Lap timer with best-lap tracking
- Speed and boost indicators

### Multiplayer Netcode
- Authoritative game server over raw WebSockets (no socket.io)
- MessagePack serialisation for compact binary frames
- Client-side prediction — your car responds instantly, server corrects drift
- State reconciliation for smooth remote player interpolation
- Deterministic tick loop on server (20 Hz)

---

## Project Structure

```
NeonDrift/
├── packages/
│   ├── client/          # Vite + Babylon.js frontend
│   │   └── src/
│   │       ├── engine/  # scene, track, car, camera, minimap, lap timer
│   │       └── input/   # keyboard + virtual joystick
│   ├── server/          # Node.js authoritative server (Hono + ws)
│   │   └── src/
│   │       ├── migrations/  # SQLite schema (better-sqlite3)
│   │       └── main.ts      # server entry point
│   └── shared/          # types, constants, MessagePack message schemas
├── docker-compose.yml
├── Dockerfile
└── package.json         # npm workspaces root
```

---

## What's Next

These features are planned but not yet implemented:

- **Matchmaking & lobbies** — room browser, ready-up flow, spectator mode
- **Power-ups** — missiles, shields, EMP (Phase 2)
- **Player accounts & progression** — XP, seasonal ranks, unlockables
- **Clan system** — clan wars, leaderboards
- **Battle pass** — cosmetics, car skins, particle trails
- **Mobile polish** — virtual joystick improvements, touch controls

See [`PLAN.md`](./PLAN.md) for the full roadmap.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| 3D engine | Babylon.js 7 |
| Frontend build | Vite + TypeScript |
| Server | Node.js 22, Hono, `ws` |
| Database | SQLite via `better-sqlite3` |
| Serialisation | MessagePack (`msgpackr`) |
| Container | Docker + Compose |

---

## Contributing

This project is in active early development. If you want to contribute:

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-thing`)
3. Make your changes with tests where applicable (`npm test`)
4. Open a pull request against `main`

Please keep PRs focused — one feature or fix per PR.
