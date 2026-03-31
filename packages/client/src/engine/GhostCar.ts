/**
 * GhostCar — rendered-only (no physics) car mesh for remote players.
 * Receives position/rotation updates from the network layer.
 * Visually distinct from the local player car (magenta vs cyan).
 */
import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  TransformNode,
  Quaternion,
} from "@babylonjs/core";

// Unique counter so mesh names don't collide across multiple ghosts
let _ghostCount = 0;

export class GhostCar {
  public readonly rootNode: TransformNode;

  constructor(scene: Scene) {
    const id = _ghostCount++;
    this.rootNode = new TransformNode(`ghost_${id}`, scene);
    // Same scale as the local CarController
    this.rootNode.scaling = new Vector3(0.4, 0.4, 0.4);

    // Hot-pink body to distinguish remote cars from the local cyan car
    const bodyMat = new StandardMaterial(`ghostBodyMat_${id}`, scene);
    bodyMat.diffuseColor = new Color3(0.4, 0.0, 0.3);
    bodyMat.emissiveColor = new Color3(1.0, 0.1, 0.7);
    bodyMat.specularColor = new Color3(0.2, 0.0, 0.15);

    const body = MeshBuilder.CreateBox(
      `ghostBody_${id}`,
      { width: 2, height: 0.9, depth: 4 },
      scene,
    );
    body.position.y = 0.45;
    body.material = bodyMat;
    body.parent = this.rootNode;

    const cabinMat = new StandardMaterial(`ghostCabinMat_${id}`, scene);
    cabinMat.diffuseColor = new Color3(0.3, 0.0, 0.2);
    cabinMat.emissiveColor = new Color3(0.7, 0.0, 0.5);

    const cabin = MeshBuilder.CreateBox(
      `ghostCabin_${id}`,
      { width: 1.4, height: 0.7, depth: 2.5 },
      scene,
    );
    cabin.position.y = 1.25;
    cabin.material = cabinMat;
    cabin.parent = this.rootNode;

    // Wheels — same positions as local car
    const wheelMat = new StandardMaterial(`ghostWheelMat_${id}`, scene);
    wheelMat.diffuseColor = new Color3(0.15, 0.05, 0.15);
    wheelMat.emissiveColor = new Color3(0.3, 0.0, 0.2);

    const wheelPositions: [number, number, number][] = [
      [1.1, 0.4, 1.5],
      [-1.1, 0.4, 1.5],
      [1.1, 0.4, -1.5],
      [-1.1, 0.4, -1.5],
    ];

    for (let i = 0; i < 4; i++) {
      const wheel = MeshBuilder.CreateCylinder(
        `ghostWheel_${id}_${i}`,
        { diameter: 0.8, height: 0.4, tessellation: 12 },
        scene,
      );
      const [wx, wy, wz] = wheelPositions[i];
      wheel.position = new Vector3(wx, wy, wz);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = wheelMat;
      wheel.parent = this.rootNode;
    }
  }

  /**
   * Apply the latest interpolated network state to this ghost's mesh.
   */
  updateFromState(
    pos: { x: number; y: number; z: number },
    rot: { x: number; y: number; z: number; w: number },
  ): void {
    this.rootNode.position.set(pos.x, pos.y, pos.z);
    // Use a quaternion directly — avoids gimbal lock and matches server output
    this.rootNode.rotationQuaternion = new Quaternion(rot.x, rot.y, rot.z, rot.w);
  }

  dispose(): void {
    // dispose(false, true) — don't dispose the TransformNode itself first,
    // but DO dispose all child meshes/materials recursively.
    this.rootNode.dispose(false, true);
  }
}
