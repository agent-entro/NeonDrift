import {
  Scene,
  Vector3,
  Curve3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  TransformNode,
} from "@babylonjs/core";

// ─── Track waypoints (City Canyon circuit, closed loop) ──────────────────────
// [x, y, z] — Y is height, ramp section lifts to y=8
const RAW_WAYPOINTS: [number, number, number][] = [
  [0, 0, 0],    // start/finish line
  [0, 0, 30],
  [0, 0, 60],
  [10, 0, 80],  // start right turn
  [30, 0, 95],
  [60, 0, 100],
  [100, 0, 100],
  [130, 0, 90], // right turn south
  [145, 0, 70],
  [145, 0, 50], // canyon S-curve starts
  [140, 0, 35],
  [150, 0, 20],
  [145, 0, 5],
  [145, 0, -10], // ramp starts
  [140, 3, -22],
  [135, 6, -32],
  [130, 8, -42], // ramp peak
  [120, 6, -52],
  [110, 3, -60],
  [95, 0, -65],  // ramp ends
  [75, 0, -75],  // right turn west
  [50, 0, -80],
  [25, 0, -80],
  [5, 0, -75],   // left turn north
  [-5, 0, -60],
  [0, 0, -40],   // chicane
  [-8, 0, -25],
  [5, 0, -12],
  [0, 0, 0],     // close loop (same as first)
];

const ROAD_HALF_WIDTH = 6;   // 12m total road width
const WALL_HEIGHT = 8;

export interface TrackSegment {
  center: Vector3;
  tangent: Vector3;
  normal: Vector3;   // right-pointing perpendicular (horizontal)
  halfWidth: number;
  groundY: number;
}

export class TrackSystem {
  private scene: Scene;
  private _splinePoints: Vector3[] = [];
  public segments: TrackSegment[] = [];
  public spawnPosition: Vector3 = new Vector3(0, 0.5, 0);
  public spawnYaw: number = 0;

  // Neon strip meshes for animation
  private neonStrips: Mesh[] = [];
  private neonTime = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this._buildTrack();
  }

  private _buildTrack(): void {
    // Convert raw waypoints to Vector3
    const waypoints = RAW_WAYPOINTS.map(([x, y, z]) => new Vector3(x, y, z));

    // Create smooth catmull-rom spline
    const spline = Curve3.CreateCatmullRomSpline(waypoints, 200, true);
    this._splinePoints = spline.getPoints();

    // Compute per-segment data
    this.segments = [];
    const pts = this._splinePoints;
    for (let i = 0; i < pts.length; i++) {
      const next = pts[(i + 1) % pts.length];
      const tangent = next.subtract(pts[i]).normalize();
      // Right-pointing normal (perpendicular in XZ plane)
      const normal = new Vector3(tangent.z, 0, -tangent.x).normalize();
      this.segments.push({
        center: pts[i].clone(),
        tangent,
        normal,
        halfWidth: ROAD_HALF_WIDTH,
        groundY: pts[i].y,
      });
    }

    // Set spawn at spline point 0 + small Y offset
    this.spawnPosition = new Vector3(pts[0].x, pts[0].y + 0.5, pts[0].z);
    this.spawnYaw = 0;

    // Build road ribbon
    this._buildRoad(this._splinePoints);

    // Build walls
    this._buildWalls(this._splinePoints);

    // Build start line
    this._buildStartLine(this._splinePoints[0], this._splinePoints[1]);
  }

  /**
   * Compute the miter-adjusted right-pointing vector at spline point i.
   *
   * Using only the outgoing tangent at each vertex causes the ribbon edges to
   * "jump" across sharp corners, making the inside of the turn clip through
   * the outside face (the "road closes" artifact).  The fix is a standard
   * miter join: blend the incoming and outgoing edge normals and scale by
   * 1/cos(half-angle) so the wall edge stays exactly ROAD_HALF_WIDTH from
   * the centreline when measured perpendicular to the road surface.
   *
   * The scale is capped at MAX_MITER to prevent extreme stretch on turns
   * that approach 180° (hairpins).
   */
  private _miterRight(pts: Vector3[], i: number): Vector3 {
    const MAX_MITER = 3.0; // caps at ~70° full-angle turn
    const n = pts.length;

    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    // Outgoing normal (same as the old per-point formula)
    const tOut = next.subtract(curr).normalize();
    const nOut = new Vector3(tOut.z, 0, -tOut.x);

    // Incoming normal
    const tIn = curr.subtract(prev).normalize();
    const nIn = new Vector3(tIn.z, 0, -tIn.x);

    // Miter direction: average of both normals, re-normalised
    const miter = nIn.add(nOut).normalize();

    // Scale = 1 / cos(half-angle).  dot(miter, nOut) == cos(half-angle).
    // Clamp denominator to avoid division-by-zero on near-180° turns.
    const cosHalf = Vector3.Dot(miter, nOut);
    const scale = Math.min(1.0 / Math.max(cosHalf, 1.0 / MAX_MITER), MAX_MITER);

    return miter.scale(scale);
  }

  private _buildRoad(pts: Vector3[]): void {
    const leftPath: Vector3[] = [];
    const rightPath: Vector3[] = [];

    for (let i = 0; i < pts.length; i++) {
      const miterRight = this._miterRight(pts, i);
      leftPath.push(pts[i].subtract(miterRight.scale(ROAD_HALF_WIDTH)));
      rightPath.push(pts[i].add(miterRight.scale(ROAD_HALF_WIDTH)));
    }

    const road = MeshBuilder.CreateRibbon("road", {
      pathArray: [leftPath, rightPath],
      closePath: true,
      closeArray: false,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);

    const roadMat = new StandardMaterial("roadMat", this.scene);
    roadMat.diffuseColor = new Color3(0.06, 0.06, 0.12);
    roadMat.specularColor = new Color3(0.1, 0.1, 0.2);
    road.material = roadMat;
    road.receiveShadows = true;
  }

  private _buildWalls(pts: Vector3[]): void {
    const leftBottom: Vector3[] = [];
    const leftTop: Vector3[] = [];
    const rightBottom: Vector3[] = [];
    const rightTop: Vector3[] = [];

    for (let i = 0; i < pts.length; i++) {
      const miterRight = this._miterRight(pts, i);

      const lEdge = pts[i].subtract(miterRight.scale(ROAD_HALF_WIDTH));
      const rEdge = pts[i].add(miterRight.scale(ROAD_HALF_WIDTH));

      leftBottom.push(lEdge);
      leftTop.push(new Vector3(lEdge.x, lEdge.y + WALL_HEIGHT, lEdge.z));
      rightBottom.push(rEdge);
      rightTop.push(new Vector3(rEdge.x, rEdge.y + WALL_HEIGHT, rEdge.z));
    }

    const wallMat = new StandardMaterial("wallMat", this.scene);
    wallMat.diffuseColor = new Color3(0.08, 0.08, 0.1);
    wallMat.specularColor = new Color3(0.05, 0.05, 0.08);

    const leftWall = MeshBuilder.CreateRibbon("leftWall", {
      pathArray: [leftBottom, leftTop],
      closePath: true,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);
    leftWall.material = wallMat;

    const rightWall = MeshBuilder.CreateRibbon("rightWall", {
      pathArray: [rightBottom, rightTop],
      closePath: true,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene);
    rightWall.material = wallMat;

    // Neon strips on wall tops
    this._buildNeonStrips(leftTop, rightTop);
  }

  private _buildNeonStrips(leftTop: Vector3[], rightTop: Vector3[]): void {
    const leftNeonMat = new StandardMaterial("leftNeonMat", this.scene);
    leftNeonMat.emissiveColor = new Color3(0, 0.9, 1);
    leftNeonMat.diffuseColor = new Color3(0, 0.1, 0.1);

    const rightNeonMat = new StandardMaterial("rightNeonMat", this.scene);
    rightNeonMat.emissiveColor = new Color3(1, 0, 0.7);
    rightNeonMat.diffuseColor = new Color3(0.1, 0, 0.07);

    // Place neon strip boxes every N points
    const step = 8;
    for (let i = 0; i < leftTop.length - 1; i += step) {
      const next = i + step < leftTop.length ? i + step : leftTop.length - 1;

      // Left strip
      const lCenter = leftTop[i].add(leftTop[next]).scale(0.5);
      const lDir = leftTop[next].subtract(leftTop[i]);
      const lLen = lDir.length();
      const lStrip = MeshBuilder.CreateBox(`lNeon${i}`, {
        width: 0.15,
        height: 0.1,
        depth: lLen,
      }, this.scene);
      lStrip.position = lCenter;
      // Align to direction
      const lAngle = Math.atan2(lDir.x, lDir.z);
      lStrip.rotation.y = lAngle;
      lStrip.material = leftNeonMat;
      this.neonStrips.push(lStrip);

      // Right strip
      const rCenter = rightTop[i].add(rightTop[next]).scale(0.5);
      const rDir = rightTop[next].subtract(rightTop[i]);
      const rLen = rDir.length();
      const rStrip = MeshBuilder.CreateBox(`rNeon${i}`, {
        width: 0.15,
        height: 0.1,
        depth: rLen,
      }, this.scene);
      rStrip.position = rCenter;
      const rAngle = Math.atan2(rDir.x, rDir.z);
      rStrip.rotation.y = rAngle;
      rStrip.material = rightNeonMat;
      this.neonStrips.push(rStrip);
    }
  }

  private _buildStartLine(p0: Vector3, p1: Vector3): void {
    const tangent = p1.subtract(p0).normalize();
    const right = new Vector3(tangent.z, 0, -tangent.x).normalize();

    const startLineMat = new StandardMaterial("startLineMat", this.scene);
    startLineMat.emissiveColor = new Color3(0.8, 0.8, 1.0);
    startLineMat.diffuseColor = new Color3(0.2, 0.2, 0.5);

    const startLine = MeshBuilder.CreateBox("startLine", {
      width: ROAD_HALF_WIDTH * 2,
      height: 0.05,
      depth: 0.5,
    }, this.scene);
    startLine.position = new Vector3(p0.x, p0.y + 0.02, p0.z);
    const angle = Math.atan2(right.x, right.z);
    startLine.rotation.y = angle;
    startLine.material = startLineMat;

    // Cyan dash marks
    const dashMat = new StandardMaterial("dashMat", this.scene);
    dashMat.emissiveColor = new Color3(0, 0.9, 1.0);
    for (let d = -2; d <= 2; d++) {
      const dash = MeshBuilder.CreateBox(`dash${d}`, {
        width: 0.3,
        height: 0.06,
        depth: 0.5,
      }, this.scene);
      dash.position = new Vector3(
        p0.x + right.x * d * 2,
        p0.y + 0.03,
        p0.z + right.z * d * 2,
      );
      dash.rotation.y = angle;
      dash.material = dashMat;
    }
  }

  /** Animate neon pulse on wall strips */
  update(dt: number): void {
    this.neonTime += dt;
    const pulse = 0.6 + 0.4 * Math.sin(this.neonTime * 3);

    for (let i = 0; i < this.neonStrips.length; i++) {
      const mat = this.neonStrips[i].material as StandardMaterial;
      if (mat && mat.emissiveColor) {
        const isLeft = i % 2 === 0;
        if (isLeft) {
          mat.emissiveColor = new Color3(0, 0.9 * pulse, 1 * pulse);
        } else {
          mat.emissiveColor = new Color3(1 * pulse, 0, 0.7 * pulse);
        }
      }
    }
  }

  /** Find index of nearest segment to a world position */
  private _nearestSegmentIndex(pos: Vector3): number {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.segments.length; i++) {
      const dx = pos.x - this.segments[i].center.x;
      const dz = pos.z - this.segments[i].center.z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  /** Returns lateral offset of pos relative to nearest segment (positive = right) */
  private _lateralOffset(pos: Vector3, segIdx: number): number {
    const seg = this.segments[segIdx];
    const diff = pos.subtract(seg.center);
    return Vector3.Dot(diff, seg.normal);
  }

  /** Check if position is on track */
  isOnTrack(pos: Vector3): boolean {
    const idx = this._nearestSegmentIndex(pos);
    const lateral = Math.abs(this._lateralOffset(pos, idx));
    return lateral <= this.segments[idx].halfWidth + 2;
  }

  /** Get interpolated ground Y at (x, z) from nearest segment */
  getGroundY(x: number, z: number): number {
    const pos = new Vector3(x, 0, z);
    const idx = this._nearestSegmentIndex(pos);
    return this.segments[idx].groundY;
  }

  /** Public getter for spline points (used by Minimap) */
  get splinePoints(): Vector3[] {
    return this._splinePoints;
  }

  /** Public wrapper for nearest segment index (used by LapTimer) */
  public getNearestSegmentIndex(pos: Vector3): number {
    return this._nearestSegmentIndex(pos);
  }

  /**
   * Get wall response: if car is near or past wall, return push + reflected lateral vel.
   * Returns null if no wall collision.
   */
  getWallResponse(
    pos: Vector3,
    lateralVelocity: number,
  ): { push: Vector3; newLateralVel: number } | null {
    const idx = this._nearestSegmentIndex(pos);
    const seg = this.segments[idx];
    const lateral = this._lateralOffset(pos, idx);
    const absLateral = Math.abs(lateral);
    const halfW = seg.halfWidth;

    if (absLateral > halfW - 1.5) {
      // Side we hit: sign of lateral
      const side = lateral > 0 ? 1 : -1;
      // Push car back inside
      const pushAmount = absLateral - (halfW - 1.5) + 0.1;
      const push = seg.normal.scale(-side * pushAmount);
      // Reflect lateral velocity
      const newLateralVel = -lateralVelocity * 0.3;
      return { push, newLateralVel };
    }
    return null;
  }
}
