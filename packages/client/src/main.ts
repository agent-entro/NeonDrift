// ─── NeonDrift Client Bootstrap ───────────────────────────────────────────────
//
// Boot order:
//   1. Init Babylon.js scene (always running in background canvas)
//   2. Set up hash router
//   3. '/'             → Landing page
//   4. '/r/:slug'      → Room lobby (connect WS)
//   5. '/watch/:roomId'→ Spectator mode
//   6. Start router (handles current hash + future changes)

import { setupScene } from "./engine/scene.js";
import { NetClient, defaultWsUrl } from "./net/NetClient.js";
import { router } from "./ui/router.js";
import { mountLanding } from "./ui/screens/Landing.js";
import { mountCreateRoomModal } from "./ui/screens/CreateRoomModal.js";
import { mountLobby, type LobbyState } from "./ui/screens/Lobby.js";
import { mountQuickPlay } from "./ui/screens/QuickPlayScreen.js";
import { SpectatorCamera } from "./engine/SpectatorCamera.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingScreen = document.getElementById("loading-screen")!;
const loadingStatus = document.getElementById("loading-status")!;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// Container for UI overlays — everything is appended here
const uiRoot = document.createElement("div");
uiRoot.id = "nd-ui-root";
document.body.appendChild(uiRoot);

// ── API base URL ─────────────────────────────────────────────────────────────
// Derived from Vite's `base` config so requests are routed correctly through
// the dev proxy (/neon/api → :3001/api) and production reverse proxy.
const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── Session storage key ───────────────────────────────────────────────────────
const SESSION_KEY = "nd_session";

interface StoredSession {
  sessionToken: string;
  playerId: string;
  displayName: string;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveSession(s: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

// ── Active unmount function (tracks current overlay) ─────────────────────────
let currentUnmount: (() => void) | null = null;
let currentNetClient: NetClient | null = null;

function unmountCurrent(): void {
  if (currentUnmount) {
    currentUnmount();
    currentUnmount = null;
  }
  if (currentNetClient) {
    currentNetClient.disconnect();
    currentNetClient = null;
  }
}

// ── Status helper ─────────────────────────────────────────────────────────────
function setStatus(msg: string): void {
  loadingStatus.textContent = msg;
}

// ── Small inline name prompt (for join-via-share-link flow) ──────────────────
function promptNameAndJoin(
  slug: string,
  onDone: (session: StoredSession) => void,
): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(6,6,16,0.95);
    z-index:80;display:flex;align-items:center;justify-content:center;
    font-family:'Courier New',Courier,monospace;
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    background:rgba(8,8,24,0.98);border:1px solid rgba(0,245,255,0.25);
    border-radius:4px;padding:36px 44px;max-width:380px;width:90vw;
    display:flex;flex-direction:column;gap:18px;
    box-shadow:0 0 40px rgba(0,245,255,0.1);
  `;

  const title = document.createElement("h2");
  title.style.cssText = "font-size:1.2rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#00f5ff;margin:0;";
  title.textContent = `Join Room #${slug}`;

  const label = document.createElement("label");
  label.style.cssText = "font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:rgba(200,220,255,0.55);";
  label.textContent = "Your Display Name";

  const suffix = Math.floor(1000 + Math.random() * 9000);
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 24;
  input.value = `Racer${suffix}`;
  input.style.cssText = `
    background:rgba(6,6,22,0.9);border:1px solid rgba(0,245,255,0.25);
    color:#e0eeff;font-family:inherit;font-size:0.9rem;padding:9px 12px;
    border-radius:2px;outline:none;
  `;

  const errorEl = document.createElement("div");
  errorEl.style.cssText = "font-size:0.8rem;color:#ff4466;min-height:1.2em;";

  const joinBtn = document.createElement("button");
  joinBtn.textContent = "Join";
  joinBtn.style.cssText = `
    padding:10px 24px;font-family:inherit;font-size:0.78rem;font-weight:700;
    letter-spacing:0.12em;text-transform:uppercase;background:transparent;
    border:1px solid #00f5ff;color:#00f5ff;cursor:pointer;border-radius:2px;
    align-self:flex-start;
  `;

  box.appendChild(title);
  box.appendChild(label);
  box.appendChild(input);
  box.appendChild(errorEl);
  box.appendChild(joinBtn);
  overlay.appendChild(box);
  uiRoot.appendChild(overlay);

  requestAnimationFrame(() => input.focus());

  async function doJoin(): Promise<void> {
    const displayName = input.value.trim();
    if (!displayName) {
      errorEl.textContent = "Please enter a display name.";
      return;
    }
    errorEl.textContent = "";
    joinBtn.disabled = true;
    joinBtn.textContent = "Joining…";

    try {
      const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(slug)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(json.message ?? `Server error ${res.status}`);
      }

      const data = await res.json() as {
        sessionToken: string;
        playerId: string;
        roomId: string;
        trackId: string;
        hostPlayerId: string;
      };

      const session: StoredSession = {
        sessionToken: data.sessionToken,
        playerId: data.playerId,
        displayName,
      };
      saveSession(session);
      overlay.remove();
      onDone(session);
    } catch (err) {
      joinBtn.disabled = false;
      joinBtn.textContent = "Join";
      errorEl.textContent = err instanceof Error ? err.message : "Failed to join.";
    }
  }

  joinBtn.addEventListener("click", () => void doJoin());
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") void doJoin(); });
}

// ── Route handlers ────────────────────────────────────────────────────────────

function showLanding(): void {
  unmountCurrent();

  currentUnmount = mountLanding(
    uiRoot,
    () => {
      // CREATE ROOM
      unmountCurrent();
      currentUnmount = mountCreateRoomModal(
        uiRoot,
        (slug, sessionToken, playerId) => {
          // Save session
          const session: StoredSession = { sessionToken, playerId, displayName: "" };
          saveSession(session);
          router.navigate(`/r/${slug}`);
        },
        () => {
          unmountCurrent();
          showLanding();
        },
      );
    },
    () => {
      // QUICK PLAY
      unmountCurrent();
      currentUnmount = mountQuickPlay(
        uiRoot,
        (slug, sessionToken, playerId) => {
          const session: StoredSession = { sessionToken, playerId, displayName: "" };
          saveSession(session);
          router.navigate(`/r/${slug}`);
        },
        () => {
          unmountCurrent();
          showLanding();
        },
      );
    },
  );
}

async function showLobby(params: Record<string, string>): Promise<void> {
  const { slug } = params;
  if (!slug) {
    router.navigate("/");
    return;
  }

  // Check localStorage for existing session
  let session = loadSession();

  if (!session) {
    // Show inline name prompt then join
    promptNameAndJoin(slug, (newSession) => {
      void showLobbyWithSession(slug, newSession);
    });
    return;
  }

  await showLobbyWithSession(slug, session);
}

async function showLobbyWithSession(
  slug: string,
  session: StoredSession,
): Promise<void> {
  unmountCurrent();

  // Fetch room info from server using the slug
  let roomInfo: {
    roomId: string;
    trackId: string;
    hostPlayerId: string;
    players: LobbyState["players"];
  };

  try {
    const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      throw new Error(`Room not found (${res.status})`);
    }
    roomInfo = await res.json() as {
      roomId: string;
      trackId: string;
      hostPlayerId: string;
      players: LobbyState["players"];
    };
  } catch (err) {
    console.error("[main] failed to fetch room info:", err);
    // Show a simple error and go back to landing
    const msg = document.createElement("div");
    msg.style.cssText = `
      position:fixed;inset:0;background:rgba(6,6,16,0.95);z-index:80;
      display:flex;align-items:center;justify-content:center;
      font-family:'Courier New',Courier,monospace;color:#ff4466;font-size:1rem;
    `;
    msg.textContent = `Could not load room: ${err instanceof Error ? err.message : "unknown error"}`;
    uiRoot.appendChild(msg);
    setTimeout(() => {
      msg.remove();
      router.navigate("/");
    }, 3000);
    return;
  }

  // Create and connect NetClient
  const netClient = new NetClient(defaultWsUrl());
  currentNetClient = netClient;
  netClient.connect();

  const lobbyState: LobbyState = {
    roomSlug: slug,
    roomId: roomInfo.roomId,
    trackId: roomInfo.trackId,
    sessionToken: session.sessionToken,
    playerId: session.playerId,
    hostPlayerId: roomInfo.hostPlayerId,
    players: roomInfo.players,
    myReady: false,
  };

  currentUnmount = mountLobby(
    uiRoot,
    lobbyState,
    netClient,
    () => {
      // Race started — unmount lobby, enable game input
      unmountCurrent();
      const hud = document.getElementById("hud");
      if (hud) hud.style.display = "";
      console.log("[main] race started!");
    },
  );
}

function showSpectator(
  params: Record<string, string>,
  scene: import("@babylonjs/core").Scene,
): void {
  const { roomId } = params;
  if (!roomId) {
    router.navigate("/");
    return;
  }

  unmountCurrent();

  // Create spectator camera
  const spectatorCam = new SpectatorCamera(scene);
  spectatorCam.activate();

  // Create and connect NetClient
  const netClient = new NetClient(defaultWsUrl());
  currentNetClient = netClient;
  netClient.connect();

  // Join room as spectator
  const session = loadSession();
  if (session) {
    netClient.send({
      type: "join",
      room_id: roomId,
      player_id: session.playerId,
      session_token: session.sessionToken,
      spectate: true,
    });
  }

  // Update spectator camera on each state message
  const unsubState = netClient.onMessage((msg) => {
    if (msg.type === "state") {
      spectatorCam.update(msg.players);
    }
  });

  // Spectator overlay
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    z-index:60;font-family:'Courier New',Courier,monospace;
    font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;
    color:rgba(200,220,255,0.55);pointer-events:none;
  `;
  overlay.textContent = `Spectating room ${roomId}`;
  uiRoot.appendChild(overlay);

  currentUnmount = () => {
    unsubState();
    spectatorCam.deactivate();
    overlay.remove();
  };
}

// ── App bootstrap ─────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  try {
    setStatus("Loading engine…");
    const { scene } = await setupScene(canvas);

    setStatus("Ready");
    await new Promise<void>((r) => setTimeout(r, 300));

    loadingScreen.classList.add("hidden");
    loadingScreen.addEventListener(
      "transitionend",
      () => loadingScreen.remove(),
      { once: true },
    );
    console.log("[main] NeonDrift initialized");

    // ── Router setup ────────────────────────────────────────────────────────
    router
      .on("/", () => showLanding())
      .on("/r/:slug", (params) => void showLobby(params))
      .on("/watch/:roomId", (params) => showSpectator(params, scene));

    // Start router — handles current hash and future hash changes
    router.start();

    // If no hash set at all, navigate to landing
    if (!location.hash || location.hash === "#") {
      router.navigate("/");
    }
  } catch (err) {
    console.error("[main] initialization failed:", err);
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

init();
