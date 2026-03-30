import {
  Scene,
  Vector3,
  FollowCamera,
  ArcRotateCamera,
  AbstractMesh,
} from "@babylonjs/core";

export type CameraMode = "chase" | "orbit";

export class GameCamera {
  private scene: Scene;
  private followCam: FollowCamera;
  private orbitCam: ArcRotateCamera;
  private canvas: HTMLCanvasElement;
  private mode: CameraMode = "chase";

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;
    this.canvas = canvas;

    // Chase camera (FollowCamera)
    this.followCam = new FollowCamera("followCam", new Vector3(0, 5, -12), scene);
    this.followCam.radius = 12;
    this.followCam.heightOffset = 5;
    this.followCam.rotationOffset = 180;
    this.followCam.cameraAcceleration = 0.05;
    this.followCam.maxCameraSpeed = 30;

    // Orbit camera (ArcRotateCamera)
    this.orbitCam = new ArcRotateCamera(
      "orbitCam",
      -Math.PI / 2,
      Math.PI / 3,
      20,
      Vector3.Zero(),
      scene,
    );
    this.orbitCam.lowerRadiusLimit = 5;
    this.orbitCam.upperRadiusLimit = 80;

    // Start in chase mode
    scene.activeCamera = this.followCam;
  }

  attach(carMesh: AbstractMesh): void {
    this.followCam.lockedTarget = carMesh;
    this.orbitCam.target = carMesh.position.clone();
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode === "chase") {
      this.orbitCam.detachControl();
      this.scene.activeCamera = this.followCam;
    } else {
      this.scene.activeCamera = this.orbitCam;
      this.orbitCam.attachControl(this.canvas, true);
    }
  }

  toggleOrbit(): void {
    this.setMode(this.mode === "chase" ? "orbit" : "chase");
  }

  update(carPos: Vector3, _carYaw: number): void {
    if (this.mode === "orbit") {
      this.orbitCam.target = carPos.clone();
    }
  }

  get activeCamera(): FollowCamera | ArcRotateCamera {
    return this.mode === "chase" ? this.followCam : this.orbitCam;
  }
}
