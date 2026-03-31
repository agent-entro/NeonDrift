import {
  Engine,
  Scene,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  GlowLayer,
} from "@babylonjs/core";
import { TrackSystem } from "./track.js";
import { CarController, type CarPhysicsInput } from "./car.js";
import { GameCamera } from "./camera.js";
import { setupPostProcessing } from "./postprocess.js";
import { InputManager } from "../input/InputManager.js";
import { VirtualJoystick } from "../input/VirtualJoystick.js";
import { LapTimer } from "./LapTimer.js";
import { Minimap } from "./Minimap.js";
import { detectGpuTier, qualitySettingsForTier } from "./GpuTier.js";

export interface SceneSetupResult {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  car: CarController;
  track: TrackSystem;
  camera: GameCamera;
  input: InputManager;
  minimap: Minimap;
  /**
   * Register a callback fired each render frame with merged input + monotonic
   * tick counter. Used by RaceNetwork to forward input and update ghost cars.
   * Only one callback at a time; calling again replaces the previous one.
   */
  registerNetworkTick: (cb: (input: CarPhysicsInput, tick: number) => void) => void;
}

export type SetupProgressCallback = (step: string, pct: number) => void;

/**
 * Bootstrap a Babylon.js WebGPU/WebGL2 scene on the given canvas.
 * Falls back to WebGL 2 automatically if WebGPU is unavailable.
 * Calls onProgress(label, 0-100) at each major step for progressive loading UI.
 */
export async function setupScene(
  canvas: HTMLCanvasElement,
  onProgress?: SetupProgressCallback,
): Promise<SceneSetupResult> {
  const report = (step: string, pct: number) => onProgress?.(step, pct);

  // ── GPU tier detection ────────────────────────────────────────────────────
  report("Detecting hardware…", 5);
  const tier = detectGpuTier();
  const quality = qualitySettingsForTier(tier);
  console.log(
    `[engine] GPU tier ${tier} — targetFps:${quality.targetFps} ` +
    `postFx:${quality.enablePostProcessing} texScale:${quality.textureScale}`,
  );

  // ── Engine init (WebGPU → WebGL2 fallback) ────────────────────────────────
  report("Starting engine…", 10);
  let engine: Engine;
  try {
    const { WebGPUEngine } = await import("@babylonjs/core/Engines/webgpuEngine.js");
    const gpuEngine = new WebGPUEngine(canvas, {
      antialias: quality.tier > 0,
      adaptToDeviceRatio: true,
    });
    // 3 s timeout guards against environments where initAsync() never rejects
    await Promise.race([
      gpuEngine.initAsync(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("WebGPU init timeout")), 3000),
      ),
    ]);
    engine = gpuEngine as unknown as Engine;
    console.log("[engine] using WebGPU");
  } catch {
    engine = new Engine(canvas, quality.tier > 0 /* antialias */, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    console.log("[engine] using WebGL 2");
  }

  // Hardware scaling reduces render resolution on low-tier mobile GPUs
  // e.g. textureScale=0.5 → renders at half res, ~4× fewer pixels to shade
  if (quality.textureScale < 1.0) {
    engine.setHardwareScalingLevel(1 / quality.textureScale);
  }

  // ── Scene ─────────────────────────────────────────────────────────────────
  report("Building scene…", 20);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.02, 0.06, 1);

  // ── Lights ────────────────────────────────────────────────────────────────
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.3;
  ambient.diffuse = new Color3(0.4, 0.6, 1.0);
  ambient.groundColor = new Color3(0.05, 0.05, 0.1);

  const sun = new DirectionalLight("sun", new Vector3(-1, -2, -1), scene);
  sun.intensity = 0.8;
  sun.diffuse = new Color3(1.0, 0.9, 0.8);

  // ── Skybox ────────────────────────────────────────────────────────────────
  const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000 }, scene);
  const skyMat = new StandardMaterial("skyMat", scene);
  skyMat.backFaceCulling = false;
  skyMat.emissiveColor = new Color3(0.02, 0.02, 0.06);
  skyMat.diffuseColor = new Color3(0, 0, 0);
  skyMat.specularColor = new Color3(0, 0, 0);
  skybox.material = skyMat;
  skybox.isPickable = false;

  // Building silhouettes — skip on low-tier to save draw calls
  if (quality.tier > 0) {
    _buildSilhouettes(scene, quality.drawDistanceMultiplier);
  }

  // ── Glow layer — expensive; skip on low-tier ──────────────────────────────
  if (quality.enableGlow) {
    const glow = new GlowLayer("glow", scene);
    glow.intensity = quality.tier === 2 ? 0.7 : 0.4;
  }

  // ── Track ─────────────────────────────────────────────────────────────────
  report("Loading track…", 40);
  const track = new TrackSystem(scene);

  // ── Car ───────────────────────────────────────────────────────────────────
  report("Loading car…", 60);
  const car = new CarController(scene, track);

  // ── Lap Timer ─────────────────────────────────────────────────────────────
  const lapTimer = new LapTimer(3, track.segments.length);

  lapTimer.onLapComplete = (lapNumber: number, _lapTimeMs: number) => {
    const lapEl = document.getElementById("lap-indicator");
    if (lapEl) lapEl.textContent = `Lap ${lapNumber + 1} / 3`;
  };

  lapTimer.onRaceComplete = (_totalTimeMs: number, lapTimesMs: number[]) => {
    _showResults(lapTimesMs);
  };

  // ── Minimap ───────────────────────────────────────────────────────────────
  const minimap = new Minimap(track.splinePoints);
  const hudEl = document.getElementById("hud");
  if (hudEl) minimap.mount(hudEl);

  // ── Input ─────────────────────────────────────────────────────────────────
  const input = new InputManager();
  const vj = new VirtualJoystick();

  // ── Camera ────────────────────────────────────────────────────────────────
  report("Setting up camera…", 75);
  const gameCamera = new GameCamera(scene, canvas);
  const bodyMesh = scene.getMeshByName("carBody");
  if (bodyMesh) gameCamera.attach(bodyMesh);

  // ── Post-processing — skip on low-tier ────────────────────────────────────
  if (quality.enablePostProcessing) {
    setupPostProcessing(scene, gameCamera.activeCamera);
  }

  // ── Keyboard orbit toggle ─────────────────────────────────────────────────
  scene.onKeyboardObservable.add((kbInfo) => {
    if (kbInfo.type === 1 /* KeyboardEventTypes.KEYDOWN */) {
      if (kbInfo.event.key === "r" || kbInfo.event.key === "R") {
        gameCamera.toggleOrbit();
      }
    }
  });

  const replayBtn = document.getElementById("results-btn-replay");
  if (replayBtn) {
    replayBtn.addEventListener("click", () => window.location.reload());
  }

  // ── Network tick hook ─────────────────────────────────────────────────────
  // Set by main.ts once the race starts. Fires every frame so RaceNetwork
  // can forward input and update ghost car positions without scene.ts
  // needing to know about networking at all.
  let networkTickCb: ((input: CarPhysicsInput, tick: number) => void) | null = null;
  let networkFrameTick = 0;

  function registerNetworkTick(cb: (input: CarPhysicsInput, tick: number) => void): void {
    networkTickCb = cb;
  }

  // ── Render loop — with optional FPS throttle for 30fps mobile target ──────
  // The throttle works by tracking wall-clock time and returning early from
  // onBeforeRender when we haven't waited long enough between frames.
  const minFrameMs = quality.targetFps < 60 ? 1000 / quality.targetFps : 0;
  let lastFrameMs = 0;

  scene.onBeforeRenderObservable.add(() => {
    if (minFrameMs > 0) {
      const now = performance.now();
      if (now - lastFrameMs < minFrameMs) return;
      lastFrameMs = now;
    }

    const dt = engine.getDeltaTime() / 1000;
    if (dt <= 0 || dt > 0.5) return;

    const kbState = input.getState();
    const vjState = vj.getState();

    const mergedInput: CarPhysicsInput = {
      steer: kbState.steer !== 0 ? kbState.steer : vjState.steer,
      throttle: Math.max(kbState.throttle, vjState.throttle),
      brake: Math.max(kbState.brake, vjState.brake),
      boost: kbState.boost,
    };

    car.update(dt, mergedInput);
    track.update(dt);
    gameCamera.update(car.position, car.yaw);
    lapTimer.update(track.getNearestSegmentIndex(car.position));
    minimap.update(car.position);
    _updateHUD(car.speed, car.boostEnergy, lapTimer.currentLap, 3);

    // Forward input to network layer (sends to server + updates ghost meshes)
    if (networkTickCb) {
      networkTickCb(mergedInput, networkFrameTick++);
    }
  });

  // ── Resize handler ────────────────────────────────────────────────────────
  window.addEventListener("resize", () => engine.resize());

  // ── Start render loop ─────────────────────────────────────────────────────
  report("Starting render loop…", 95);
  engine.runRenderLoop(() => scene.render());

  report("Ready", 100);
  return { engine, scene, canvas, car, track, camera: gameCamera, input, minimap, registerNetworkTick };
}

// ─── HUD update ──────────────────────────────────────────────────────────────
function _updateHUD(
  speed: number,
  boostEnergy: number,
  currentLap: number,
  totalLaps: number,
): void {
  const speedEl = document.getElementById("speed-value");
  if (speedEl) speedEl.textContent = Math.round(speed * 3.6).toString();

  const boostBar = document.getElementById("boost-bar");
  if (boostBar) {
    boostBar.style.width = `${boostEnergy * 100}%`;
    boostBar.style.background = boostEnergy > 0.5
      ? "linear-gradient(90deg, #00f5ff, #ff00aa)"
      : "rgba(0, 245, 255, 0.3)";
  }

  const lapEl = document.getElementById("lap-indicator");
  if (lapEl) {
    lapEl.textContent = `Lap ${Math.min(currentLap, totalLaps)} / ${totalLaps}`;
  }
}

// ─── Format lap time as "M:SS.mmm" ───────────────────────────────────────────
function _formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

// ─── Show results screen ──────────────────────────────────────────────────────
function _showResults(lapTimes: number[]): void {
  const resultsScreen = document.getElementById("results-screen");
  if (resultsScreen) resultsScreen.style.display = "flex";

  const lapsEl = document.getElementById("results-laps");
  if (lapsEl) {
    lapsEl.innerHTML = lapTimes
      .map((t, i) => `LAP ${i + 1} &nbsp; ${_formatTime(t)}`)
      .join("<br>");
  }

  const totalEl = document.getElementById("results-total");
  if (totalEl) {
    totalEl.textContent = `TOTAL  ${_formatTime(lapTimes.reduce((a, b) => a + b, 0))}`;
  }
}

// ─── Building silhouettes (mid/high tier only) ────────────────────────────────
function _buildSilhouettes(scene: Scene, drawDistMult: number): void {
  const bldgMat = new StandardMaterial("bldgMat", scene);
  bldgMat.emissiveColor = new Color3(0.015, 0.01, 0.025);
  bldgMat.diffuseColor = new Color3(0, 0, 0);

  const positions: [number, number, number, number, number][] = [
    [-200, 0, 150, 20, 60],
    [300, 0, 200, 25, 80],
    [-300, 0, -100, 15, 45],
    [250, 0, -200, 30, 100],
    [-100, 0, 300, 18, 55],
    [400, 0, 100, 22, 70],
    [-350, 0, 200, 16, 50],
    [150, 0, -300, 28, 90],
  ];

  // LOD fade distance scales with quality tier's draw distance multiplier
  const lodFadeDist = Math.round(400 * drawDistMult);

  for (let i = 0; i < positions.length; i++) {
    const [x, , z, w, h] = positions[i];
    const bldg = MeshBuilder.CreateBox(`bldg${i}`, { width: w, height: h, depth: w * 0.7 }, scene);
    bldg.position = new Vector3(x, h / 2 - 5, z);
    bldg.material = bldgMat;
    bldg.isPickable = false;
    // LOD: buildings beyond lodFadeDist become invisible — saves GPU overdraw
    bldg.addLODLevel(lodFadeDist, null);
  }
}
