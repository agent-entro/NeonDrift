// ─── Landing Screen ───────────────────────────────────────────────────────────

const STYLE_ID = "nd-landing-styles";

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .nd-landing-overlay {
      position: fixed;
      inset: 0;
      background: rgba(6, 6, 16, 0.88);
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', Courier, monospace;
    }
    .nd-landing-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      padding: 48px 56px;
      border: 1px solid rgba(0, 245, 255, 0.2);
      background: rgba(6, 6, 22, 0.85);
      border-radius: 4px;
      box-shadow: 0 0 40px rgba(0, 245, 255, 0.1), 0 0 80px rgba(255, 0, 170, 0.05);
      max-width: 480px;
      width: 90vw;
    }
    .nd-landing-title {
      font-size: clamp(2.5rem, 7vw, 4rem);
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: linear-gradient(90deg, #00f5ff, #ff00aa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0;
      line-height: 1.1;
    }
    .nd-landing-tagline {
      font-size: 0.9rem;
      color: rgba(200, 220, 255, 0.65);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin: 0;
    }
    .nd-landing-buttons {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .nd-btn {
      padding: 12px 28px;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      background: transparent;
      cursor: pointer;
      border-radius: 2px;
      transition: background 0.15s, box-shadow 0.15s;
    }
    .nd-btn:focus-visible {
      outline: 2px solid #00f5ff;
      outline-offset: 2px;
    }
    .nd-btn-cyan {
      border: 1px solid #00f5ff;
      color: #00f5ff;
    }
    .nd-btn-cyan:hover {
      background: rgba(0, 245, 255, 0.12);
      box-shadow: 0 0 16px rgba(0, 245, 255, 0.35);
    }
    .nd-btn-pink {
      border: 1px solid #ff00aa;
      color: #ff00aa;
    }
    .nd-btn-pink:hover {
      background: rgba(255, 0, 170, 0.12);
      box-shadow: 0 0 16px rgba(255, 0, 170, 0.35);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Mounts the landing page overlay over `container`.
 *
 * @returns cleanup function that removes the overlay
 */
export function mountLanding(
  container: HTMLElement,
  onCreateRoom: () => void,
  onQuickPlay: () => void,
): () => void {
  injectStyles();

  const overlay = document.createElement("div");
  overlay.className = "nd-landing-overlay";

  const card = document.createElement("div");
  card.className = "nd-landing-card";

  const title = document.createElement("h1");
  title.className = "nd-landing-title";
  title.textContent = "NeonDrift";

  const tagline = document.createElement("p");
  tagline.className = "nd-landing-tagline";
  tagline.textContent = "Zero-install 3D multiplayer racing";

  const buttons = document.createElement("div");
  buttons.className = "nd-landing-buttons";

  const createBtn = document.createElement("button");
  createBtn.className = "nd-btn nd-btn-cyan";
  createBtn.textContent = "Create Room";
  createBtn.addEventListener("click", onCreateRoom);

  const quickBtn = document.createElement("button");
  quickBtn.className = "nd-btn nd-btn-pink";
  quickBtn.textContent = "Quick Play";
  quickBtn.addEventListener("click", onQuickPlay);

  buttons.appendChild(createBtn);
  buttons.appendChild(quickBtn);

  card.appendChild(title);
  card.appendChild(tagline);
  card.appendChild(buttons);
  overlay.appendChild(card);
  container.appendChild(overlay);

  return () => {
    overlay.remove();
  };
}
