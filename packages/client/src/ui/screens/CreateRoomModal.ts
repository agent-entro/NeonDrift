// ─── Create Room Modal ────────────────────────────────────────────────────────

// Respect Vite's `base` config so API requests are routed correctly through
// the dev proxy (and behind a reverse proxy in production).
const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const MODAL_STYLE_ID = "nd-modal-styles";

function injectModalStyles(): void {
  if (document.getElementById(MODAL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MODAL_STYLE_ID;
  style.textContent = `
    .nd-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(6, 6, 16, 0.92);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', Courier, monospace;
    }
    .nd-modal-box {
      background: rgba(8, 8, 24, 0.98);
      border: 1px solid rgba(0, 245, 255, 0.3);
      border-radius: 4px;
      padding: 40px 48px;
      max-width: 420px;
      width: 90vw;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-shadow: 0 0 60px rgba(0, 245, 255, 0.12);
    }
    .nd-modal-title {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #00f5ff;
      margin: 0;
    }
    .nd-modal-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .nd-modal-label {
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(200, 220, 255, 0.55);
    }
    .nd-modal-input,
    .nd-modal-select {
      background: rgba(6, 6, 22, 0.9);
      border: 1px solid rgba(0, 245, 255, 0.25);
      color: #e0eeff;
      font-family: inherit;
      font-size: 0.9rem;
      padding: 9px 12px;
      border-radius: 2px;
      outline: none;
      transition: border-color 0.15s;
    }
    .nd-modal-input:focus,
    .nd-modal-select:focus {
      border-color: #00f5ff;
    }
    .nd-modal-select option {
      background: #0a0a1e;
    }
    .nd-modal-error {
      font-size: 0.8rem;
      color: #ff4466;
      letter-spacing: 0.05em;
      min-height: 1.2em;
    }
    .nd-modal-buttons {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .nd-modal-btn {
      padding: 10px 24px;
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
    .nd-modal-btn:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .nd-modal-btn-cyan {
      border: 1px solid #00f5ff;
      color: #00f5ff;
    }
    .nd-modal-btn-cyan:not(:disabled):hover {
      background: rgba(0, 245, 255, 0.12);
      box-shadow: 0 0 12px rgba(0, 245, 255, 0.3);
    }
    .nd-modal-btn-ghost {
      border: 1px solid rgba(200, 220, 255, 0.2);
      color: rgba(200, 220, 255, 0.55);
    }
    .nd-modal-btn-ghost:not(:disabled):hover {
      border-color: rgba(200, 220, 255, 0.45);
      color: rgba(200, 220, 255, 0.85);
    }
  `;
  document.head.appendChild(style);
}

const TRACKS = [
  { id: "city_canyon", name: "City Canyon" },
  { id: "orbital_loop", name: "Orbital Loop" },
  { id: "crystal_caverns", name: "Crystal Caverns" },
];

function randomRacerName(): string {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `Racer${suffix}`;
}

/**
 * Mounts the Create Room modal.
 *
 * @returns cleanup function
 */
export function mountCreateRoomModal(
  container: HTMLElement,
  onCreated: (slug: string, sessionToken: string, playerId: string) => void,
  onCancel: () => void,
): () => void {
  injectModalStyles();

  const overlay = document.createElement("div");
  overlay.className = "nd-modal-overlay";

  const box = document.createElement("div");
  box.className = "nd-modal-box";

  // Title
  const title = document.createElement("h2");
  title.className = "nd-modal-title";
  title.textContent = "Create Room";

  // Display name field
  const nameField = document.createElement("div");
  nameField.className = "nd-modal-field";
  const nameLabel = document.createElement("label");
  nameLabel.className = "nd-modal-label";
  nameLabel.textContent = "Display Name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "nd-modal-input";
  nameInput.maxLength = 24;
  nameInput.value = randomRacerName();
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);

  // Track selector
  const trackField = document.createElement("div");
  trackField.className = "nd-modal-field";
  const trackLabel = document.createElement("label");
  trackLabel.className = "nd-modal-label";
  trackLabel.textContent = "Track";
  const trackSelect = document.createElement("select");
  trackSelect.className = "nd-modal-select";
  for (const track of TRACKS) {
    const opt = document.createElement("option");
    opt.value = track.id;
    opt.textContent = track.name;
    trackSelect.appendChild(opt);
  }
  trackSelect.value = "city_canyon";
  trackField.appendChild(trackLabel);
  trackField.appendChild(trackSelect);

  // Error display
  const errorEl = document.createElement("div");
  errorEl.className = "nd-modal-error";
  errorEl.setAttribute("role", "alert");
  errorEl.setAttribute("aria-live", "polite");

  // Buttons
  const buttons = document.createElement("div");
  buttons.className = "nd-modal-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "nd-modal-btn nd-modal-btn-ghost";
  cancelBtn.textContent = "Cancel";

  const createBtn = document.createElement("button");
  createBtn.className = "nd-modal-btn nd-modal-btn-cyan";
  createBtn.textContent = "Create";

  buttons.appendChild(cancelBtn);
  buttons.appendChild(createBtn);

  box.appendChild(title);
  box.appendChild(nameField);
  box.appendChild(trackField);
  box.appendChild(errorEl);
  box.appendChild(buttons);
  overlay.appendChild(box);
  container.appendChild(overlay);

  // Focus name input
  requestAnimationFrame(() => nameInput.focus());

  let destroyed = false;

  async function handleCreate(): Promise<void> {
    const displayName = nameInput.value.trim();
    if (!displayName) {
      errorEl.textContent = "Please enter a display name.";
      nameInput.focus();
      return;
    }

    const trackId = trackSelect.value;
    errorEl.textContent = "";
    createBtn.disabled = true;
    cancelBtn.disabled = true;
    createBtn.textContent = "Creating…";

    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, trackId }),
      });

      if (!res.ok) {
        let msg = `Server error (${res.status})`;
        try {
          const json = await res.json() as { message?: string; error?: string };
          msg = json.message ?? json.error ?? msg;
        } catch {
          // ignore parse error
        }
        throw new Error(msg);
      }

      const data = await res.json() as {
        slug: string;
        sessionToken: string;
        playerId: string;
      };

      if (destroyed) return;
      onCreated(data.slug, data.sessionToken, data.playerId);
    } catch (err) {
      if (destroyed) return;
      errorEl.textContent = err instanceof Error ? err.message : "Failed to create room.";
      createBtn.disabled = false;
      cancelBtn.disabled = false;
      createBtn.textContent = "Create";
    }
  }

  createBtn.addEventListener("click", () => void handleCreate());
  cancelBtn.addEventListener("click", () => {
    if (destroyed) return;
    onCancel();
  });

  // Allow Enter key in inputs to submit
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void handleCreate();
  });

  return () => {
    destroyed = true;
    overlay.remove();
  };
}
