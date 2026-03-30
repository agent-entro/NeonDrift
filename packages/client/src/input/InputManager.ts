export interface InputState {
  steer: number;    // -1 (left) to +1 (right)
  throttle: number; // 0 to 1
  brake: number;    // 0 to 1
  boost: boolean;   // one-shot: true only on first frame after press
}

export class InputManager {
  private pressedKeys = new Set<string>();
  private boostPressed = false;
  private boostConsumed = false;
  private gamepadBoostPressed = false;
  private gamepadBoostConsumed = false;

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;

  constructor() {
    this.onKeyDown = (e: KeyboardEvent) => {
      this.pressedKeys.add(e.code);
      if (e.code === "Space") {
        if (!this.boostConsumed) {
          this.boostPressed = true;
        }
      }
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.pressedKeys.delete(e.code);
      if (e.code === "Space") {
        this.boostPressed = false;
        this.boostConsumed = false;
      }
    };

    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
  }

  getState(): InputState {
    // ── Keyboard ──────────────────────────────────────────────────────────────
    let steer = 0;
    let throttle = 0;
    let brake = 0;

    if (this.pressedKeys.has("ArrowLeft") || this.pressedKeys.has("KeyA")) {
      steer = -1;
    } else if (this.pressedKeys.has("ArrowRight") || this.pressedKeys.has("KeyD")) {
      steer = 1;
    }

    if (this.pressedKeys.has("ArrowUp") || this.pressedKeys.has("KeyW")) {
      throttle = 1;
    }

    if (this.pressedKeys.has("ArrowDown") || this.pressedKeys.has("KeyS")) {
      brake = 1;
    }

    // Boost one-shot
    let boost = false;
    if (this.boostPressed && !this.boostConsumed) {
      boost = true;
      this.boostConsumed = true;
    }

    // ── Gamepad ───────────────────────────────────────────────────────────────
    const gamepads = typeof navigator !== "undefined" && navigator.getGamepads
      ? navigator.getGamepads()
      : [];

    for (const gp of gamepads) {
      if (!gp) continue;

      // Steer: left stick X (axes[0])
      if (Math.abs(gp.axes[0]) > 0.1) {
        steer = Math.max(-1, Math.min(1, gp.axes[0]));
      }

      // Throttle: right trigger (buttons[7])
      if (gp.buttons[7] && gp.buttons[7].value > 0.05) {
        throttle = Math.max(throttle, gp.buttons[7].value);
      }

      // Brake: left trigger (buttons[6])
      if (gp.buttons[6] && gp.buttons[6].value > 0.05) {
        brake = Math.max(brake, gp.buttons[6].value);
      }

      // Boost: A button (buttons[0]), one-shot
      if (gp.buttons[0] && gp.buttons[0].pressed) {
        if (!this.gamepadBoostConsumed) {
          boost = true;
          this.gamepadBoostConsumed = true;
          this.gamepadBoostPressed = true;
        }
      } else {
        if (this.gamepadBoostPressed) {
          // Button released, reset
          this.gamepadBoostPressed = false;
          this.gamepadBoostConsumed = false;
        }
      }

      break; // use first active gamepad only
    }

    return { steer, throttle, brake, boost };
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
  }
}
