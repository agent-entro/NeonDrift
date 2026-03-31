import { setupScene } from "./engine/scene.js";

const loadingScreen = document.getElementById("loading-screen")!;
const loadingStatus = document.getElementById("loading-status")!;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

function setStatus(msg: string): void {
  loadingStatus.textContent = msg;
}

async function init(): Promise<void> {
  try {
    setStatus("Loading engine…");
    const { engine } = await setupScene(canvas);

    setStatus("Ready");
    // Short delay so the spinner is visible before hiding.
    await new Promise((r) => setTimeout(r, 300));

    loadingScreen.classList.add("hidden");
    // Remove from DOM after the 0.4 s CSS opacity transition finishes so the
    // fixed overlay can never interfere with canvas hit-testing.
    loadingScreen.addEventListener(
      "transitionend",
      () => loadingScreen.remove(),
      { once: true },
    );
    console.log("[main] NeonDrift initialized");
    console.log(`[main] WebGL version: ${engine.version}`);
  } catch (err) {
    console.error("[main] initialization failed:", err);
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

init();
