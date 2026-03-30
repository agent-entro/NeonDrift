import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  GlowLayer,
} from "@babylonjs/core";

export interface SceneSetupResult {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
}

/**
 * Bootstrap a Babylon.js WebGPU/WebGL2 scene on the given canvas.
 * Falls back to WebGL 2 automatically if WebGPU is unavailable.
 */
export async function setupScene(canvas: HTMLCanvasElement): Promise<SceneSetupResult> {
  // Try WebGPU first, fall back to WebGL 2
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
  scene.clearColor = new Color4(0.02, 0.02, 0.06, 1); // deep dark blue

  // Ambient light
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.3;
  ambient.diffuse = new Color3(0.4, 0.6, 1.0); // cool blue tint

  // Key directional light
  const sun = new DirectionalLight("sun", new Vector3(-1, -2, -1), scene);
  sun.intensity = 0.8;
  sun.diffuse = new Color3(1.0, 0.9, 0.8);

  // Placeholder camera (orbits a fixed point — replaced by chase cam in Phase 1A)
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 20, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 100;

  // Glow layer for neon effects
  const glow = new GlowLayer("glow", scene);
  glow.intensity = 0.6;

  // Placeholder ground plane
  const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.05, 0.05, 0.1);
  groundMat.specularColor = new Color3(0, 0, 0);
  ground.material = groundMat;

  // Placeholder neon grid lines (visual stand-in until track is built)
  for (let i = -5; i <= 5; i++) {
    const h = MeshBuilder.CreateLines(`hLine${i}`, {
      points: [new Vector3(-25, 0.01, i * 5), new Vector3(25, 0.01, i * 5)],
    }, scene);
    h.color = new Color3(0, 0.3, 0.5);

    const v = MeshBuilder.CreateLines(`vLine${i}`, {
      points: [new Vector3(i * 5, 0.01, -25), new Vector3(i * 5, 0.01, 25)],
    }, scene);
    v.color = new Color3(0, 0.3, 0.5);
  }

  // Placeholder car box
  const carBox = MeshBuilder.CreateBox("car", { width: 2, height: 0.8, depth: 4 }, scene);
  carBox.position.y = 0.4;
  const carMat = new StandardMaterial("carMat", scene);
  carMat.emissiveColor = new Color3(0, 0.9, 1.0); // neon cyan
  carBox.material = carMat;

  // Resize handler
  window.addEventListener("resize", () => engine.resize());

  // Start render loop
  engine.runRenderLoop(() => {
    scene.render();
  });

  return { engine, scene, canvas };
}
