import { Vector3 } from "@babylonjs/core";

/**
 * SVG minimap displayed in the top-left corner of the screen.
 */
export class Minimap {
  private _size: number;
  private _trackPoints: Vector3[];

  private _container: HTMLDivElement;
  private _svg: SVGSVGElement;
  private _carDot: SVGCircleElement;

  // Bounding box for projection (with padding)
  private _minX: number = 0;
  private _maxX: number = 1;
  private _minZ: number = 0;
  private _maxZ: number = 1;
  private _rangeX: number = 1;
  private _rangeZ: number = 1;

  constructor(trackPoints: Vector3[], size: number = 150) {
    this._size = size;
    this._trackPoints = trackPoints;

    // Compute bounding box with 10% padding
    this._computeBounds();

    // Build DOM structure
    this._container = document.createElement("div");
    this._container.style.cssText = [
      "position:absolute",
      "top:16px",
      "left:16px",
      `width:${size}px`,
      `height:${size}px`,
      "background:rgba(0,0,10,0.75)",
      "border:1px solid rgba(0,245,255,0.5)",
      "border-radius:6px",
      "overflow:hidden",
      "box-shadow:0 0 8px rgba(0,245,255,0.2)",
      "pointer-events:none",
    ].join(";");

    const svgNS = "http://www.w3.org/2000/svg";
    this._svg = document.createElementNS(svgNS, "svg") as SVGSVGElement;
    this._svg.setAttribute("width", String(size));
    this._svg.setAttribute("height", String(size));
    this._svg.style.display = "block";

    // Draw track polyline
    const polyline = document.createElementNS(svgNS, "polyline") as SVGPolylineElement;
    const points = trackPoints.map(p => {
      const [sx, sy] = this._project(p.x, p.z);
      return `${sx},${sy}`;
    }).join(" ");
    polyline.setAttribute("points", points);
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", "#00f5ff");
    polyline.setAttribute("stroke-width", "1.5");
    polyline.setAttribute("stroke-opacity", "0.7");
    this._svg.appendChild(polyline);

    // Car dot
    this._carDot = document.createElementNS(svgNS, "circle") as SVGCircleElement;
    this._carDot.setAttribute("r", "4");
    this._carDot.setAttribute("fill", "#00f5ff");
    this._carDot.setAttribute("cx", String(size / 2));
    this._carDot.setAttribute("cy", String(size / 2));
    this._svg.appendChild(this._carDot);

    this._container.appendChild(this._svg);
  }

  private _computeBounds(): void {
    if (this._trackPoints.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const p of this._trackPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    // Add 10% padding
    const padX = (maxX - minX) * 0.1;
    const padZ = (maxZ - minZ) * 0.1;

    this._minX = minX - padX;
    this._maxX = maxX + padX;
    this._minZ = minZ - padZ;
    this._maxZ = maxZ + padZ;
    this._rangeX = this._maxX - this._minX || 1;
    this._rangeZ = this._maxZ - this._minZ || 1;
  }

  /** Project world (x, z) to SVG (svgX, svgY) */
  private _project(x: number, z: number): [number, number] {
    const svgX = ((x - this._minX) / this._rangeX) * this._size;
    // SVG Y=0 is top; Babylon +Z is forward (away from camera = "north").
    // Flip so +Z maps to top of minimap, matching the main view orientation.
    const svgY = this._size - ((z - this._minZ) / this._rangeZ) * this._size;
    return [svgX, svgY];
  }

  update(carPos: Vector3, _otherCars?: Vector3[]): void {
    const [cx, cy] = this._project(carPos.x, carPos.z);
    this._carDot.setAttribute("cx", String(cx));
    this._carDot.setAttribute("cy", String(cy));
  }

  mount(container: HTMLElement): void {
    container.appendChild(this._container);
  }

  destroy(): void {
    if (this._container.parentElement) {
      this._container.parentElement.removeChild(this._container);
    }
  }
}
