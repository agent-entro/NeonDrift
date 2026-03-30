export interface VirtualJoystickState {
  steer: number;    // -1 to 1
  throttle: number; // 0 to 1
  brake: number;    // 0 to 1
}

interface TouchZone {
  touchId: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  active: boolean;
}

export class VirtualJoystick {
  private container: HTMLDivElement;
  private leftZone: HTMLDivElement;
  private rightZone: HTMLDivElement;
  private joystickBase: HTMLDivElement;
  private joystickKnob: HTMLDivElement;
  private brakeButton: HTMLDivElement;

  private leftTouch: TouchZone = { touchId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, active: false };
  private rightTouch: TouchZone = { touchId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, active: false };

  private steer = 0;
  private throttle = 0;
  private brake = 0;

  constructor() {
    // Container: full-screen overlay
    this.container = document.createElement("div");
    Object.assign(this.container.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "20",
      display: "none",
    });

    // Left zone: left half of screen
    this.leftZone = document.createElement("div");
    Object.assign(this.leftZone.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "50%",
      height: "100%",
      pointerEvents: "auto",
    });

    // Right zone: right half of screen
    this.rightZone = document.createElement("div");
    Object.assign(this.rightZone.style, {
      position: "absolute",
      right: "0",
      top: "0",
      width: "50%",
      height: "100%",
      pointerEvents: "auto",
    });

    // Joystick base (shown on touch)
    this.joystickBase = document.createElement("div");
    Object.assign(this.joystickBase.style, {
      position: "absolute",
      width: "100px",
      height: "100px",
      borderRadius: "50%",
      border: "2px solid rgba(0, 245, 255, 0.5)",
      background: "rgba(0, 245, 255, 0.1)",
      display: "none",
      transform: "translate(-50%, -50%)",
    });

    // Joystick knob
    this.joystickKnob = document.createElement("div");
    Object.assign(this.joystickKnob.style, {
      position: "absolute",
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      background: "rgba(0, 245, 255, 0.7)",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
    });
    this.joystickBase.appendChild(this.joystickKnob);

    // Brake button (right zone)
    this.brakeButton = document.createElement("div");
    Object.assign(this.brakeButton.style, {
      position: "absolute",
      bottom: "60px",
      right: "60px",
      width: "80px",
      height: "80px",
      borderRadius: "50%",
      border: "2px solid rgba(255, 0, 170, 0.5)",
      background: "rgba(255, 0, 170, 0.1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(255, 0, 170, 0.8)",
      fontFamily: "sans-serif",
      fontSize: "14px",
      fontWeight: "bold",
      letterSpacing: "0.05em",
    });
    this.brakeButton.textContent = "BRAKE";

    this.leftZone.appendChild(this.joystickBase);
    this.rightZone.appendChild(this.brakeButton);
    this.container.appendChild(this.leftZone);
    this.container.appendChild(this.rightZone);

    // Event listeners
    this.leftZone.addEventListener("touchstart", this._onLeftTouchStart.bind(this), { passive: false });
    this.leftZone.addEventListener("touchmove", this._onLeftTouchMove.bind(this), { passive: false });
    this.leftZone.addEventListener("touchend", this._onLeftTouchEnd.bind(this), { passive: false });
    this.leftZone.addEventListener("touchcancel", this._onLeftTouchEnd.bind(this), { passive: false });

    this.rightZone.addEventListener("touchstart", this._onRightTouchStart.bind(this), { passive: false });
    this.rightZone.addEventListener("touchend", this._onRightTouchEnd.bind(this), { passive: false });
    this.rightZone.addEventListener("touchcancel", this._onRightTouchEnd.bind(this), { passive: false });

    document.body.appendChild(this.container);

    // Auto-show on touch devices
    if ("ontouchstart" in window) {
      this.show();
    }
  }

  private _onLeftTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.changedTouches[0];
    this.leftTouch = {
      touchId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      active: true,
    };

    // Position joystick base at touch point
    const rect = this.leftZone.getBoundingClientRect();
    this.joystickBase.style.left = `${touch.clientX - rect.left}px`;
    this.joystickBase.style.top = `${touch.clientY - rect.top}px`;
    this.joystickBase.style.display = "block";
  }

  private _onLeftTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.leftTouch.active) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.leftTouch.touchId) {
        this.leftTouch.currentX = touch.clientX;
        this.leftTouch.currentY = touch.clientY;

        const maxDist = 40; // radius of joystick
        const dx = touch.clientX - this.leftTouch.startX;
        const dy = touch.clientY - this.leftTouch.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, maxDist);

        const angle = Math.atan2(dy, dx);
        const knobX = Math.cos(angle) * clampedDist;
        const knobY = Math.sin(angle) * clampedDist;

        this.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

        // Steer: X axis, normalize -1 to 1
        this.steer = Math.max(-1, Math.min(1, dx / maxDist));
        // Throttle: negative Y = forward (up on screen)
        this.throttle = Math.max(0, Math.min(1, -dy / maxDist));

        break;
      }
    }
  }

  private _onLeftTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.leftTouch.touchId) {
        this.leftTouch.active = false;
        this.leftTouch.touchId = null;
        this.steer = 0;
        this.throttle = 0;
        this.joystickBase.style.display = "none";
        this.joystickKnob.style.transform = "translate(-50%, -50%)";
        break;
      }
    }
  }

  private _onRightTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.rightTouch.active = true;
    this.rightTouch.touchId = e.changedTouches[0].identifier;
    this.brake = 1;
    this.brakeButton.style.background = "rgba(255, 0, 170, 0.4)";
  }

  private _onRightTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.rightTouch.touchId) {
        this.rightTouch.active = false;
        this.rightTouch.touchId = null;
        this.brake = 0;
        this.brakeButton.style.background = "rgba(255, 0, 170, 0.1)";
        break;
      }
    }
  }

  getState(): VirtualJoystickState {
    return { steer: this.steer, throttle: this.throttle, brake: this.brake };
  }

  show(): void {
    this.container.style.display = "block";
  }

  hide(): void {
    this.container.style.display = "none";
  }

  destroy(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
