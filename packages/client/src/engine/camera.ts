/**
 * Chase and orbit cameras for NeonDrift.
 *
 * The original FollowCamera.lockedTarget approach was broken: FollowCamera
 * reads `lockedTarget.rotation.y` which is the LOCAL rotation — always 0 on
 * the carBody mesh because the actual yaw lives on the parent rootNode.
 * Result: camera stayed fixed in one world direction regardless of car heading.
 *
 * Replacement: FreeCamera positioned manually each frame from carPos + carYaw.
 * Exponential smoothing gives a responsive chase feel without jitter.
 */
import {
  Scene,
  Vector3,
  FreeCamera,
  ArcRotateCamera,
  AbstractMesh,
} from "@babylonjs/core";

export type CameraMode = "chase" | "orbit";

// Chase camera tuning constants
const CHASE_DIST = 12;        // m behind the car
const CHASE_HEIGHT = 5;       // m above the car centre
const CHASE_LOOK_AHEAD = 4;   // m ahead of car used as look-at point
const CHASE_LAG = 7;          // exponential-smoothing rate (higher = snappier)

export class GameCamera {
  private scene: Scene;
  private chaseCamera: FreeCamera;
  private orbitCam: ArcRotateCamera;
  private canvas: HTMLCanvasElement;
  private mode: CameraMode = "chase";

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;
    this.canvas = canvas;

    // Chase camera – position updated manually every frame in update()
    this.chaseCamera = new FreeCamera("chaseCamera", new Vector3(0, 5, -12), scene);
    this.chaseCamera.minZ = 0.1;
    this.chaseCamera.maxZ = 2000;

    // Orbit camera for free-look / debug
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

    scene.activeCamera = this.chaseCamera;
  }

  /** Set the orbit camera's initial look-at target. */
  attach(carMesh: AbstractMesh): void {
    this.orbitCam.target = carMesh.getAbsolutePosition().clone();
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode === "chase") {
      this.orbitCam.detachControl();
      this.scene.activeCamera = this.chaseCamera;
    } else {
      this.scene.activeCamera = this.orbitCam;
      this.orbitCam.attachControl(this.canvas, true);
    }
  }

  toggleOrbit(): void {
    this.setMode(this.mode === "chase" ? "orbit" : "chase");
  }

  /**
   * Called every frame. Positions the chase camera behind the car using
   * carYaw so the view always looks forward over the car's roof.
   */
  update(carPos: Vector3, carYaw: number): void {
    if (this.mode === "chase") {
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      // Exponential smoothing: alpha → 1 as dt grows; avoids frame-rate dependence
      const alpha = Math.min(1, 1 - Math.exp(-CHASE_LAG * dt));

      // Ideal position: directly behind and above the car
      const idealPos = new Vector3(
        carPos.x - Math.sin(carYaw) * CHASE_DIST,
        carPos.y + CHASE_HEIGHT,
        carPos.z - Math.cos(carYaw) * CHASE_DIST,
      );

      // Smoothly interpolate toward ideal position
      this.chaseCamera.position = Vector3.Lerp(this.chaseCamera.position, idealPos, alpha);

      // Look slightly ahead of the car (not directly at the car centre)
      const lookAt = new Vector3(
        carPos.x + Math.sin(carYaw) * CHASE_LOOK_AHEAD,
        carPos.y + 1.0,
        carPos.z + Math.cos(carYaw) * CHASE_LOOK_AHEAD,
      );
      this.chaseCamera.setTarget(lookAt);
    } else {
      this.orbitCam.target = carPos.clone();
    }
  }

  get activeCamera(): FreeCamera | ArcRotateCamera {
    return this.mode === "chase" ? this.chaseCamera : this.orbitCam;
  }
}
