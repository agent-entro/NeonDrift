// ─── Lobby Screen ─────────────────────────────────────────────────────────────

import { NetClient } from "../../net/NetClient.js";
import type { RoomStateMessage } from "@neondrift/shared";

const LOBBY_STYLE_ID = "nd-lobby-styles";

function injectLobbyStyles(): void {
  if (document.getElementById(LOBBY_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = LOBBY_STYLE_ID;
  style.textContent = `
    .nd-lobby-overlay {
      position: fixed;
      inset: 0;
      background: rgba(6, 6, 16, 0.9);
      z-index: 60;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', Courier, monospace;
    }
    .nd-lobby-panel {
      background: rgba(8, 8, 24, 0.97);
      border: 1px solid rgba(0, 245, 255, 0.25);
      border-radius: 4px;
      padding: 36px 44px;
      max-width: 500px;
      width: 92vw;
      display: flex;
      flex-direction: column;
      gap: 22px;
      box-shadow: 0 0 60px rgba(0, 245, 255, 0.1);
    }
    .nd-lobby-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .nd-lobby-room-name {
      font-size: 1.3rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #00f5ff;
      margin: 0;
    }
    .nd-lobby-copy-btn {
      padding: 6px 14px;
      font-family: inherit;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      background: transparent;
      border: 1px solid rgba(0, 245, 255, 0.35);
      color: rgba(0, 245, 255, 0.7);
      cursor: pointer;
      border-radius: 2px;
      transition: all 0.15s;
    }
    .nd-lobby-copy-btn:hover {
      background: rgba(0, 245, 255, 0.08);
      border-color: #00f5ff;
      color: #00f5ff;
    }
    .nd-lobby-invite-url {
      font-size: 0.68rem;
      color: rgba(0, 245, 255, 0.35);
      letter-spacing: 0.04em;
      word-break: break-all;
      line-height: 1.4;
      margin-top: -8px;
    }
    .nd-lobby-track-info {
      font-size: 0.78rem;
      color: rgba(200, 220, 255, 0.45);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .nd-lobby-players-title {
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(200, 220, 255, 0.5);
      margin: 0 0 8px 0;
    }
    .nd-lobby-player-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .nd-lobby-player-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: rgba(0, 245, 255, 0.04);
      border: 1px solid rgba(0, 245, 255, 0.1);
      border-radius: 2px;
    }
    .nd-lobby-player-status {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .nd-lobby-player-status.ready {
      background: #22dd77;
      box-shadow: 0 0 6px #22dd77;
    }
    .nd-lobby-player-status.not-ready {
      background: rgba(200, 220, 255, 0.2);
    }
    .nd-lobby-player-name {
      flex: 1;
      font-size: 0.88rem;
      color: #d0e4ff;
      letter-spacing: 0.04em;
    }
    .nd-lobby-player-badge {
      font-size: 0.66rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(200, 220, 255, 0.35);
    }
    .nd-lobby-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .nd-lobby-btn {
      padding: 11px 26px;
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      background: transparent;
      cursor: pointer;
      border-radius: 2px;
      transition: background 0.15s, box-shadow 0.15s, opacity 0.15s;
    }
    .nd-lobby-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .nd-lobby-btn-ready {
      border: 1px solid #22dd77;
      color: #22dd77;
    }
    .nd-lobby-btn-ready:not(:disabled):hover {
      background: rgba(34, 221, 119, 0.1);
      box-shadow: 0 0 12px rgba(34, 221, 119, 0.25);
    }
    .nd-lobby-btn-ready.active {
      background: rgba(34, 221, 119, 0.15);
    }
    .nd-lobby-btn-start {
      border: 1px solid #ff00aa;
      color: #ff00aa;
    }
    .nd-lobby-btn-start:not(:disabled):hover {
      background: rgba(255, 0, 170, 0.12);
      box-shadow: 0 0 12px rgba(255, 0, 170, 0.3);
    }
    /* Countdown overlay */
    .nd-countdown-overlay {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .nd-countdown-number {
      font-family: 'Courier New', Courier, monospace;
      font-size: clamp(6rem, 20vw, 12rem);
      font-weight: 900;
      background: linear-gradient(90deg, #00f5ff, #ff00aa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: nd-countdown-pop 0.4s ease-out;
      letter-spacing: -0.02em;
    }
    @keyframes nd-countdown-pop {
      0% { transform: scale(1.6); opacity: 0; }
      60% { transform: scale(0.95); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

const TRACK_NAMES: Record<string, string> = {
  city_canyon: "City Canyon",
  orbital_loop: "Orbital Loop",
  crystal_caverns: "Crystal Caverns",
};

export interface LobbyState {
  roomSlug: string;
  roomId: string;
  trackId: string;
  sessionToken: string;
  playerId: string;
  hostPlayerId: string;
  players: Array<{
    player_id: string;
    display_name: string;
    slot: number;
    is_ready: boolean;
  }>;
  myReady: boolean;
}

/**
 * Mounts the lobby overlay.
 *
 * @returns cleanup/unmount function
 */
export function mountLobby(
  container: HTMLElement,
  state: LobbyState,
  netClient: NetClient,
  onRaceStart: () => void,
): () => void {
  injectLobbyStyles();

  // Mutable lobby state
  let players = [...state.players];
  let myReady = state.myReady;
  let hostPlayerId = state.hostPlayerId;
  let countdownOverlay: HTMLElement | null = null;
  let destroyed = false;

  // ── Build overlay DOM ──────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.className = "nd-lobby-overlay";

  const panel = document.createElement("div");
  panel.className = "nd-lobby-panel";

  // Header: room name + copy link
  const header = document.createElement("div");
  header.className = "nd-lobby-header";

  const roomNameEl = document.createElement("h2");
  roomNameEl.className = "nd-lobby-room-name";
  roomNameEl.textContent = `#${state.roomSlug}`;

  // Build the canonical invite URL: <origin><base>/join/<slug>
  // e.g. https://game.example.com/neon/join/neon-tiger-99
  const _base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const inviteUrl = `${window.location.origin}${_base}/join/${state.roomSlug}`;

  const copyBtn = document.createElement("button");
  copyBtn.className = "nd-lobby-copy-btn";
  copyBtn.textContent = "Copy Invite Link";

  function doCopy(): void {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy Invite Link"; }, 1800);
    }).catch(() => {
      // Fallback for browsers that block clipboard API without HTTPS
      const ta = document.createElement("textarea");
      ta.value = inviteUrl;
      ta.style.cssText = "position:fixed;top:-9999px;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy Invite Link"; }, 1800);
    });
  }

  copyBtn.addEventListener("click", doCopy);

  // Show the invite URL below the header so players can see / share it manually
  const inviteUrlEl = document.createElement("div");
  inviteUrlEl.className = "nd-lobby-invite-url";
  inviteUrlEl.textContent = inviteUrl;

  header.appendChild(roomNameEl);
  header.appendChild(copyBtn);

  // Track info
  const trackInfoEl = document.createElement("div");
  trackInfoEl.className = "nd-lobby-track-info";
  trackInfoEl.textContent = `Track: ${TRACK_NAMES[state.trackId] ?? state.trackId}`;

  // Player list
  const playersSection = document.createElement("div");

  const playersTitleEl = document.createElement("div");
  playersTitleEl.className = "nd-lobby-players-title";
  playersTitleEl.textContent = "Players";

  const playerListEl = document.createElement("div");
  playerListEl.className = "nd-lobby-player-list";

  playersSection.appendChild(playersTitleEl);
  playersSection.appendChild(playerListEl);

  // Action buttons
  const actionsEl = document.createElement("div");
  actionsEl.className = "nd-lobby-actions";

  const readyBtn = document.createElement("button");
  readyBtn.className = "nd-lobby-btn nd-lobby-btn-ready";
  readyBtn.textContent = myReady ? "Not Ready" : "Ready";
  if (myReady) readyBtn.classList.add("active");

  const startBtn = document.createElement("button");
  startBtn.className = "nd-lobby-btn nd-lobby-btn-start";
  startBtn.textContent = "Start Race";

  actionsEl.appendChild(readyBtn);
  actionsEl.appendChild(startBtn);

  panel.appendChild(header);
  panel.appendChild(inviteUrlEl);
  panel.appendChild(trackInfoEl);
  panel.appendChild(playersSection);
  panel.appendChild(actionsEl);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderPlayerList(): void {
    playerListEl.innerHTML = "";
    for (const p of players) {
      const row = document.createElement("div");
      row.className = "nd-lobby-player-row";

      const statusDot = document.createElement("div");
      statusDot.className = `nd-lobby-player-status ${p.is_ready ? "ready" : "not-ready"}`;

      const nameEl = document.createElement("div");
      nameEl.className = "nd-lobby-player-name";
      nameEl.textContent = p.display_name;

      row.appendChild(statusDot);
      row.appendChild(nameEl);

      if (p.player_id === hostPlayerId) {
        const badge = document.createElement("span");
        badge.className = "nd-lobby-player-badge";
        badge.textContent = "HOST";
        row.appendChild(badge);
      }

      if (p.player_id === state.playerId) {
        const badge = document.createElement("span");
        badge.className = "nd-lobby-player-badge";
        badge.textContent = "YOU";
        row.appendChild(badge);
      }

      playerListEl.appendChild(row);
    }
  }

  function updateStartButton(): void {
    const isHost = state.playerId === hostPlayerId;
    const allReady = players.length > 0 && players.every((p) => p.is_ready);
    startBtn.style.display = isHost ? "" : "none";
    startBtn.disabled = !allReady;
  }

  function renderAll(): void {
    renderPlayerList();
    updateStartButton();
    readyBtn.textContent = myReady ? "Not Ready" : "Ready";
    readyBtn.classList.toggle("active", myReady);
  }

  // Initial render
  renderAll();

  // ── Ready button ───────────────────────────────────────────────────────────
  readyBtn.addEventListener("click", () => {
    myReady = !myReady;
    netClient.send({ type: "ready", is_ready: myReady });
    readyBtn.textContent = myReady ? "Not Ready" : "Ready";
    readyBtn.classList.toggle("active", myReady);
  });

  // START RACE button (host only, shown when all ready)
  startBtn.addEventListener("click", () => {
    // Server auto-starts when all are ready; this is just UX sugar.
    // The server handles actual start; if shown, all are ready.
    // Send a ready+true to ensure server sees host ready.
    netClient.send({ type: "ready", is_ready: true });
  });

  // ── Countdown overlay helper ───────────────────────────────────────────────
  function showCountdown(seconds: number): void {
    if (countdownOverlay) {
      countdownOverlay.remove();
      countdownOverlay = null;
    }
    const cdOverlay = document.createElement("div");
    cdOverlay.className = "nd-countdown-overlay";
    const numEl = document.createElement("div");
    numEl.className = "nd-countdown-number";
    numEl.textContent = String(seconds);
    cdOverlay.appendChild(numEl);
    document.body.appendChild(cdOverlay);
    countdownOverlay = cdOverlay;
    // Auto-remove after 900ms
    setTimeout(() => {
      if (countdownOverlay === cdOverlay) {
        cdOverlay.remove();
        countdownOverlay = null;
      }
    }, 900);
  }

  // ── NetClient subscription ────────────────────────────────────────────────
  // Join the room
  netClient.send({
    type: "join",
    room_id: state.roomId,
    player_id: state.playerId,
    session_token: state.sessionToken,
  });

  const unsubNet = netClient.onMessage((msg) => {
    if (destroyed) return;

    if (msg.type === "room_state") {
      const rs = msg as RoomStateMessage;
      players = rs.players;
      hostPlayerId = rs.host_player_id;
      // Sync our own ready state from server list
      const me = players.find((p) => p.player_id === state.playerId);
      if (me) myReady = me.is_ready;
      renderAll();
    } else if (msg.type === "countdown") {
      showCountdown(msg.seconds);
    } else if (msg.type === "race_start") {
      // Clean up countdown overlay if still present
      if (countdownOverlay) {
        countdownOverlay.remove();
        countdownOverlay = null;
      }
      onRaceStart();
    }
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  return () => {
    destroyed = true;
    unsubNet();
    if (countdownOverlay) {
      countdownOverlay.remove();
      countdownOverlay = null;
    }
    overlay.remove();
  };
}
