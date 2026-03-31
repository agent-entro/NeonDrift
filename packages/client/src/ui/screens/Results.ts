/**
 * Post-race results screen with XP animation, race-again, and replay share.
 * Mounts as a full-screen overlay over the game canvas.
 */

import type { RaceFinishMessage } from "@neondrift/shared";

export interface ResultsOptions {
  raceId: string;
  myPlayerId: string;
  onRaceAgain: () => void;
  onBackToLobby: () => void;
}

const MEDALS = ["🥇", "🥈", "🥉"];

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function buildResultsHTML(
  results: RaceFinishMessage["results"],
  myPlayerId: string,
  raceId: string,
): string {
  const rows = results
    .map((r) => {
      const isMe = r.player_id === myPlayerId;
      const medal = MEDALS[r.position - 1] ?? `${r.position}`;
      return `
      <tr class="${isMe ? "nd-results-me" : ""}">
        <td class="nd-results-pos">${medal}</td>
        <td class="nd-results-name">${escapeHtml(r.display_name)}</td>
        <td class="nd-results-time">${formatTime(r.total_time_ms)}</td>
        <td class="nd-results-lap">${formatTime(r.best_lap_ms)}</td>
        <td class="nd-results-xp" data-xp="${r.xp_earned}">+0 XP</td>
      </tr>`;
    })
    .join("");

  const shareUrl = `${location.origin}/watch/${raceId}`;

  return `
  <div id="nd-results-overlay">
    <div id="nd-results-card">
      <h1 class="nd-results-title">RACE OVER</h1>
      <table id="nd-results-table">
        <thead>
          <tr>
            <th>#</th><th>PLAYER</th><th>TIME</th><th>BEST LAP</th><th>XP</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div id="nd-results-share">
        <span>Replay:</span>
        <input id="nd-results-link" type="text" readonly value="${escapeHtml(shareUrl)}" />
        <button id="nd-results-copy">Copy</button>
      </div>
      <div id="nd-results-actions">
        <button id="nd-results-again" class="nd-btn-primary">RACE AGAIN</button>
        <button id="nd-results-lobby" class="nd-btn-secondary">BACK TO LOBBY</button>
      </div>
    </div>
  </div>`;
}

function injectStyles(): void {
  if (document.getElementById("nd-results-styles")) return;
  const style = document.createElement("style");
  style.id = "nd-results-styles";
  style.textContent = `
    #nd-results-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,5,0.85);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Courier New', monospace;
      animation: nd-fadein 0.4s ease;
    }
    @keyframes nd-fadein { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    #nd-results-card {
      background: #050510; border: 1px solid #0ff;
      box-shadow: 0 0 40px rgba(0,255,255,0.25);
      padding: 2rem; border-radius: 8px;
      min-width: min(700px, 95vw); max-height: 90vh; overflow-y: auto;
    }
    .nd-results-title {
      text-align: center; color: #0ff; font-size: 2rem; letter-spacing: 0.3em;
      margin: 0 0 1.5rem; text-shadow: 0 0 20px #0ff;
    }
    #nd-results-table { width: 100%; border-collapse: collapse; }
    #nd-results-table th {
      color: #888; font-size: 0.75rem; letter-spacing: 0.1em;
      padding: 0.4rem 0.6rem; border-bottom: 1px solid #333; text-align: left;
    }
    #nd-results-table td { padding: 0.5rem 0.6rem; color: #ccc; }
    .nd-results-me td { color: #0ff; background: rgba(0,255,255,0.05); }
    .nd-results-pos { font-size: 1.3rem; }
    .nd-results-xp { color: #ff0 !important; font-weight: bold; }
    #nd-results-share {
      display: flex; gap: 0.5rem; align-items: center;
      margin: 1.5rem 0 1rem; color: #888; font-size: 0.85rem;
    }
    #nd-results-link {
      flex: 1; background: #0a0a1a; border: 1px solid #333; color: #0ff;
      padding: 0.35rem 0.5rem; font-size: 0.8rem; border-radius: 4px;
      font-family: inherit;
    }
    #nd-results-copy {
      background: #0a0a1a; border: 1px solid #0ff; color: #0ff;
      padding: 0.35rem 0.75rem; cursor: pointer; border-radius: 4px;
    }
    #nd-results-copy:hover { background: rgba(0,255,255,0.1); }
    #nd-results-actions { display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem; }
    .nd-btn-primary {
      background: #0ff; color: #000; border: none;
      padding: 0.75rem 2rem; font-size: 1rem; font-weight: bold;
      letter-spacing: 0.1em; cursor: pointer; border-radius: 4px;
      font-family: inherit;
    }
    .nd-btn-primary:hover { background: #7ff; }
    .nd-btn-secondary {
      background: transparent; color: #888; border: 1px solid #444;
      padding: 0.75rem 2rem; font-size: 1rem; cursor: pointer;
      border-radius: 4px; font-family: inherit;
    }
    .nd-btn-secondary:hover { color: #ccc; border-color: #888; }
    @keyframes nd-xp-count { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Mount the results screen. Returns an unmount function.
 */
export function mountResults(
  container: HTMLElement,
  finishMsg: RaceFinishMessage,
  opts: ResultsOptions,
): () => void {
  injectStyles();

  container.insertAdjacentHTML(
    "beforeend",
    buildResultsHTML(finishMsg.results, opts.myPlayerId, opts.raceId),
  );

  const overlay = container.querySelector<HTMLElement>("#nd-results-overlay")!;

  // Animate XP counters
  finishMsg.results.forEach((r) => {
    const cell = overlay.querySelector<HTMLElement>(
      `td.nd-results-xp[data-xp="${r.xp_earned}"]`,
    );
    if (!cell) return;

    let current = 0;
    const step = Math.ceil(r.xp_earned / 30);
    const timer = setInterval(() => {
      current = Math.min(current + step, r.xp_earned);
      cell.textContent = `+${current} XP`;
      if (current >= r.xp_earned) {
        clearInterval(timer);
        cell.style.animation = "nd-xp-count 0.2s ease";
      }
    }, 40);
  });

  // Copy replay link
  const copyBtn = overlay.querySelector<HTMLButtonElement>("#nd-results-copy")!;
  const linkInput = overlay.querySelector<HTMLInputElement>("#nd-results-link")!;
  copyBtn.addEventListener("click", () => {
    linkInput.select();
    try {
      navigator.clipboard.writeText(linkInput.value).catch(() => {
        document.execCommand("copy");
      });
    } catch {
      document.execCommand("copy");
    }
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
  });

  // Race again / lobby buttons
  overlay
    .querySelector<HTMLButtonElement>("#nd-results-again")!
    .addEventListener("click", opts.onRaceAgain);
  overlay
    .querySelector<HTMLButtonElement>("#nd-results-lobby")!
    .addEventListener("click", opts.onBackToLobby);

  return () => {
    overlay.remove();
  };
}
