// ─── Quick Play / Matchmaking Screen ─────────────────────────────────────────

const QP_STYLE_ID = "nd-quickplay-styles";

function injectQPStyles(): void {
  if (document.getElementById(QP_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = QP_STYLE_ID;
  style.textContent = `
    .nd-qp-overlay {
      position: fixed;
      inset: 0;
      background: rgba(6, 6, 16, 0.92);
      z-index: 70;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', Courier, monospace;
    }
    .nd-qp-panel {
      background: rgba(8, 8, 24, 0.98);
      border: 1px solid rgba(255, 0, 170, 0.3);
      border-radius: 4px;
      padding: 40px 48px;
      max-width: 420px;
      width: 90vw;
      display: flex;
      flex-direction: column;
      gap: 22px;
      box-shadow: 0 0 60px rgba(255, 0, 170, 0.1);
    }
    .nd-qp-title {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #ff00aa;
      margin: 0;
    }
    .nd-qp-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .nd-qp-label {
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(200, 220, 255, 0.55);
    }
    .nd-qp-input {
      background: rgba(6, 6, 22, 0.9);
      border: 1px solid rgba(255, 0, 170, 0.25);
      color: #e0eeff;
      font-family: inherit;
      font-size: 0.9rem;
      padding: 9px 12px;
      border-radius: 2px;
      outline: none;
      transition: border-color 0.15s;
    }
    .nd-qp-input:focus {
      border-color: #ff00aa;
    }
    .nd-qp-status {
      font-size: 0.85rem;
      color: rgba(200, 220, 255, 0.6);
      letter-spacing: 0.06em;
      min-height: 1.4em;
    }
    .nd-qp-status.searching {
      color: #00f5ff;
      animation: nd-pulse 1.5s ease-in-out infinite;
    }
    .nd-qp-error {
      font-size: 0.8rem;
      color: #ff4466;
      letter-spacing: 0.05em;
      min-height: 1.2em;
    }
    @keyframes nd-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .nd-qp-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(0, 245, 255, 0.3);
      border-top-color: #00f5ff;
      border-radius: 50%;
      animation: nd-spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 8px;
    }
    @keyframes nd-spin {
      to { transform: rotate(360deg); }
    }
    .nd-qp-buttons {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .nd-qp-btn {
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
    .nd-qp-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .nd-qp-btn-pink {
      border: 1px solid #ff00aa;
      color: #ff00aa;
    }
    .nd-qp-btn-pink:not(:disabled):hover {
      background: rgba(255, 0, 170, 0.12);
      box-shadow: 0 0 12px rgba(255, 0, 170, 0.3);
    }
    .nd-qp-btn-ghost {
      border: 1px solid rgba(200, 220, 255, 0.2);
      color: rgba(200, 220, 255, 0.55);
    }
    .nd-qp-btn-ghost:not(:disabled):hover {
      border-color: rgba(200, 220, 255, 0.45);
      color: rgba(200, 220, 255, 0.85);
    }
  `;
  document.head.appendChild(style);
}

function randomRacerName(): string {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `Racer${suffix}`;
}

type QueuePhase = "input" | "queued" | "found";

/**
 * Mounts the Quick Play / matchmaking screen.
 *
 * @returns cleanup/unmount function
 */
export function mountQuickPlay(
  container: HTMLElement,
  onMatchFound: (slug: string, sessionToken: string, playerId: string) => void,
  onCancel: () => void,
): () => void {
  injectQPStyles();

  let phase: QueuePhase = "input";
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let sessionToken: string | null = null;
  let destroyed = false;

  // ── DOM ────────────────────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.className = "nd-qp-overlay";

  const panel = document.createElement("div");
  panel.className = "nd-qp-panel";

  const title = document.createElement("h2");
  title.className = "nd-qp-title";
  title.textContent = "Finding Match";

  // Name field (shown during input phase)
  const nameField = document.createElement("div");
  nameField.className = "nd-qp-field";
  const nameLabel = document.createElement("label");
  nameLabel.className = "nd-qp-label";
  nameLabel.textContent = "Display Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "nd-qp-input";
  nameInput.maxLength = 24;
  nameInput.value = randomRacerName();
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  // Status / queue info
  const statusEl = document.createElement("div");
  statusEl.className = "nd-qp-status";

  // Error
  const errorEl = document.createElement("div");
  errorEl.className = "nd-qp-error";
  errorEl.setAttribute("role", "alert");
  errorEl.setAttribute("aria-live", "polite");

  // Buttons
  const buttons = document.createElement("div");
  buttons.className = "nd-qp-buttons";

  const joinBtn = document.createElement("button");
  joinBtn.className = "nd-qp-btn nd-qp-btn-pink";
  joinBtn.textContent = "Join Queue";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "nd-qp-btn nd-qp-btn-ghost";
  cancelBtn.textContent = "Cancel";

  buttons.appendChild(joinBtn);
  buttons.appendChild(cancelBtn);

  panel.appendChild(title);
  panel.appendChild(nameField);
  panel.appendChild(statusEl);
  panel.appendChild(errorEl);
  panel.appendChild(buttons);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  requestAnimationFrame(() => nameInput.focus());

  // ── Helpers ────────────────────────────────────────────────────────────────
  function setStatus(msg: string, searching = false): void {
    statusEl.className = `nd-qp-status${searching ? " searching" : ""}`;
    if (searching) {
      statusEl.innerHTML = `<span class="nd-qp-spinner"></span>${msg}`;
    } else {
      statusEl.textContent = msg;
    }
  }

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function startPolling(token: string): Promise<void> {
    // Poll every 2 seconds
    pollTimer = setInterval(async () => {
      if (destroyed) {
        stopPolling();
        return;
      }

      try {
        const res = await fetch(
          `/api/matchmaking/status?sessionToken=${encodeURIComponent(token)}`,
        );

        if (!res.ok) {
          const json = await res.json().catch(() => ({})) as { message?: string };
          setStatus(`Queue error: ${json.message ?? res.status}`);
          return;
        }

        const data = await res.json() as {
          matchFound: boolean;
          slug?: string;
          position?: number;
          sessionToken?: string;
          playerId?: string;
        };

        if (destroyed) return;

        if (data.matchFound && data.slug) {
          phase = "found";
          stopPolling();
          setStatus("Match found!");
          onMatchFound(
            data.slug,
            data.sessionToken ?? token,
            data.playerId ?? "",
          );
        } else {
          const pos = data.position ?? "?";
          setStatus(`Queue position: ${pos}`, true);
        }
      } catch (err) {
        if (destroyed) return;
        setStatus(`Poll error: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }, 2000);
  }

  async function handleJoinQueue(): Promise<void> {
    const displayName = nameInput.value.trim();
    if (!displayName) {
      errorEl.textContent = "Please enter a display name.";
      nameInput.focus();
      return;
    }

    errorEl.textContent = "";
    joinBtn.disabled = true;
    nameInput.disabled = true;
    setStatus("Joining queue…", true);
    phase = "queued";

    try {
      const res = await fetch("/api/matchmaking/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(json.message ?? json.error ?? `Server error ${res.status}`);
      }

      const data = await res.json() as {
        sessionToken: string;
        position?: number;
      };

      if (destroyed) return;

      sessionToken = data.sessionToken;
      const pos = data.position ?? "?";
      setStatus(`Queue position: ${pos}`, true);
      await startPolling(sessionToken);
    } catch (err) {
      if (destroyed) return;
      phase = "input";
      joinBtn.disabled = false;
      nameInput.disabled = false;
      errorEl.textContent = err instanceof Error ? err.message : "Failed to join queue.";
      setStatus("");
    }
  }

  async function handleCancel(): Promise<void> {
    if (destroyed) return;
    stopPolling();

    if (sessionToken && phase === "queued") {
      try {
        await fetch("/api/matchmaking", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken }),
        });
      } catch {
        // Ignore cancel errors
      }
    }

    onCancel();
  }

  joinBtn.addEventListener("click", () => void handleJoinQueue());
  cancelBtn.addEventListener("click", () => void handleCancel());
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void handleJoinQueue();
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  return () => {
    destroyed = true;
    stopPolling();
    overlay.remove();
  };
}
