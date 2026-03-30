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
import { CarController } from "./car.js";
import { GameCamera } from "./camera.js";
import { setupPostProcessing } from "./postprocess.js";
import { InputManager } from "../input/InputManager.js";
import { VirtualJoystick } from "../input/VirtualJoystick.js";

export interface SceneSetupResult {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  car: CarController;
  track: TrackSystem;
  camera: GameCamera;
  input: InputManager;
}

/**
 * Bootstrap a Babylon.js WebGPU/WebGL2 scene on the given canvas.
 * Falls back to WebGL 2 automatically if WebGPU is unavailable.
 */
export async function setupScene(canvas: HTMLCanvasElement): Promise<SceneSetupResult> {
  // ── Engine init (WebGPU → WebGL2 fallback) ────────────────────────────────
  let engine: Engine;
  try {
    const { WebGPUEngine } = await import("@babylonjs/core/Engines/webgpuEngine.js");
    const gpuEngine = new WebGPUEngine(canvas, {
      antialias: true,
      adaptToDeviceRatio: true,
    });
    await gpuEngine.initAsync();
    engine = gpuEngine as unknown as Engine;
    console.log("[engine] using WebGPU");
  } catch {
    engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    console.log("[engine] using WebGL 2");
  }

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.02, 0.06, 1);

  // ── Lights ────────────────────────────────────────────────────────────────
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.3;
  ambient.diffuse = new Color3(0.4, 0.6, 1.0);   // cool blue tint
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

  // Distant building silhouettes
  _buildSilhouettes(scene);

  // ── Glow layer ────────────────────────────────────────────────────────────
  const glow = new GlowLayer("glow", scene);
  glow.intensity = 0.5;

  // ── Track ─────────────────────────────────────────────────────────────────
  const track = new TrackSystem(scene);

  // ── Car ───────────────────────────────────────────────────────────────────
  const car = new CarController(scene, track);

  // ── Input ─────────────────────────────────────────────────────────────────
  const input = new InputManager();

  // Virtual joystick (mobile)
  const vj = new VirtualJoystick();

  // ── Camera ────────────────────────────────────────────────────────────────
  const gameCamera = new GameCamera(scene, canvas);
  // We need an AbstractMesh — use the root node's child body mesh
  const bodyMesh = scene.getMeshByName("carBody");
  if (bodyMesh) {
    gameCamera.attach(bodyMesh);
  }

  // ── Post-processing ───────────────────────────────────────────────────────
  // Set up AFTER camera creation
  setupPostProcessing(scene, gameCamera.activeCamera);

  // ── Keyboard orbit toggle ─────────────────────────────────────────────────
  scene.onKeyboardObservable.add((kbInfo) => {
    if (kbInfo.type === 1 /* KeyboardEventTypes.KEYDOWN */) {
      if (kbInfo.event.key === "r" || kbInfo.event.key === "R") {
        gameCamera.toggleOrbit();
      }
    }
  });

  // ── Render loop / update ──────────────────────────────────────────────────
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    if (dt <= 0 || dt > 0.5) return;

    // Merge keyboard + virtual joystick input
    const kbState = input.getState();
    const vjState = vj.getState();

    const mergedInput = {
      steer: kbState.steer !== 0 ? kbState.steer : vjState.steer,
      throttle: Math.max(kbState.throttle, vjState.throttle),
      brake: Math.max(kbState.brake, vjState.brake),
      boost: kbState.boost,
    };

    // Update game systems
    car.update(dt, mergedInput);
    track.update(dt);
    gameCamera.update(car.position, car.yaw);

    // Update HUD
    _updateHUD(car.speed, car.isBoosting);
  });

  // ── Resize handler ────────────────────────────────────────────────────────
  window.addEventListener("resize", () => engine.resize());

  // ── Render loop ───────────────────────────────────────────────────────────
  engine.runRenderLoop(() => {
    scene.render();
  });

  return { engine, scene, canvas, car, track, camera: gameCamera, input };
}

// ─── HUD update ──────────────────────────────────────────────────────────────
function _updateHUD(speed: number, isBoosting: boolean): void {
  const speedEl = document.getElementById("speed-value");
  if (speedEl) {
    speedEl.textContent = Math.round(speed * 3.6).toString(); // m/s → km/h
  }

  const boostBar = document.getElementById("boost-bar");
  if (boostBar) {
    // Visual pulse when boosting
    boostBar.style.width = isBoosting ? "100%" : "0%";
    boostBar.style.background = isBoosting
      ? "linear-gradient(90deg, #00f5ff, #ff00aa)"
      : "rgba(0, 245, 255, 0.3)";
  }
}

// ─── Building silhouettes ─────────────────────────────────────────────────────
function _buildSilhouettes(scene: Scene): void {
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

  for (let i = 0; i < positions.length; i++) {
    const [x, , z, w, h] = positions[i];
    const bldg = MeshBuilder.CreateBox(`bldg${i}`, {
      width: w,
      height: h,
      depth: w * 0.7,
    }, scene);
    bldg.position = new Vector3(x, h / 2 - 5, z);
    bldg.material = bldgMat;
    bldg.isPickable = false;
  }
}
