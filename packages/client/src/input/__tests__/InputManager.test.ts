import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InputManager } from "../InputManager.js";

// Helper: dispatch a keyboard event on document
function dispatchKey(type: "keydown" | "keyup", code: string): void {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
}

describe("InputManager — initialization", () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
  });

  afterEach(() => {
    input.destroy();
  });

  it("initializes with zero steer", () => {
    expect(input.getState().steer).toBe(0);
  });

  it("initializes with zero throttle", () => {
    expect(input.getState().throttle).toBe(0);
  });

  it("initializes with zero brake", () => {
    expect(input.getState().brake).toBe(0);
  });

  it("initializes with boost false", () => {
    expect(input.getState().boost).toBe(false);
  });
});

describe("InputManager — keyboard input", () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
  });

  afterEach(() => {
    input.destroy();
    // Clean up any lingering key events
    dispatchKey("keyup", "KeyW");
    dispatchKey("keyup", "KeyA");
    dispatchKey("keyup", "KeyS");
    dispatchKey("keyup", "KeyD");
    dispatchKey("keyup", "Space");
    dispatchKey("keyup", "ArrowUp");
    dispatchKey("keyup", "ArrowDown");
    dispatchKey("keyup", "ArrowLeft");
    dispatchKey("keyup", "ArrowRight");
  });

  it("KeyW sets throttle to 1", () => {
    dispatchKey("keydown", "KeyW");
    expect(input.getState().throttle).toBe(1);
  });

  it("ArrowUp sets throttle to 1", () => {
    dispatchKey("keydown", "ArrowUp");
    expect(input.getState().throttle).toBe(1);
  });

  it("KeyS sets brake to 1", () => {
    dispatchKey("keydown", "KeyS");
    expect(input.getState().brake).toBe(1);
  });

  it("ArrowDown sets brake to 1", () => {
    dispatchKey("keydown", "ArrowDown");
    expect(input.getState().brake).toBe(1);
  });

  it("KeyA sets steer to -1", () => {
    dispatchKey("keydown", "KeyA");
    expect(input.getState().steer).toBe(-1);
  });

  it("ArrowLeft sets steer to -1", () => {
    dispatchKey("keydown", "ArrowLeft");
    expect(input.getState().steer).toBe(-1);
  });

  it("KeyD sets steer to +1", () => {
    dispatchKey("keydown", "KeyD");
    expect(input.getState().steer).toBe(1);
  });

  it("ArrowRight sets steer to +1", () => {
    dispatchKey("keydown", "ArrowRight");
    expect(input.getState().steer).toBe(1);
  });

  it("keyup releases key (throttle returns to 0)", () => {
    dispatchKey("keydown", "KeyW");
    expect(input.getState().throttle).toBe(1);
    dispatchKey("keyup", "KeyW");
    expect(input.getState().throttle).toBe(0);
  });

  it("keyup releases steer", () => {
    dispatchKey("keydown", "KeyD");
    expect(input.getState().steer).toBe(1);
    dispatchKey("keyup", "KeyD");
    expect(input.getState().steer).toBe(0);
  });
});

describe("InputManager — boost one-shot", () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
  });

  afterEach(() => {
    input.destroy();
    dispatchKey("keyup", "Space");
  });

  it("Space key returns boost=true on first getState call", () => {
    dispatchKey("keydown", "Space");
    expect(input.getState().boost).toBe(true);
  });

  it("boost is false on second getState call (one-shot)", () => {
    dispatchKey("keydown", "Space");
    input.getState(); // consume
    expect(input.getState().boost).toBe(false);
  });

  it("boost resets after Space is released and pressed again", () => {
    dispatchKey("keydown", "Space");
    input.getState(); // consume

    // Release key
    dispatchKey("keyup", "Space");

    // Press again
    dispatchKey("keydown", "Space");
    expect(input.getState().boost).toBe(true);
  });

  it("boost stays false when Space is not pressed", () => {
    expect(input.getState().boost).toBe(false);
    expect(input.getState().boost).toBe(false);
  });
});

describe("InputManager — destroy", () => {
  it("destroy removes event listeners so keys no longer register", () => {
    const input = new InputManager();
    input.destroy();

    dispatchKey("keydown", "KeyW");
    // After destroy, the pressed key should not affect state
    // (the listener is removed, so pressedKeys set won't be updated)
    expect(input.getState().throttle).toBe(0);

    dispatchKey("keyup", "KeyW");
  });

  it("calling destroy twice does not throw", () => {
    const input = new InputManager();
    expect(() => {
      input.destroy();
      input.destroy();
    }).not.toThrow();
  });
});

describe("InputManager — multiple keys", () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
  });

  afterEach(() => {
    input.destroy();
    dispatchKey("keyup", "KeyW");
    dispatchKey("keyup", "KeyD");
  });

  it("throttle and steer can be active simultaneously", () => {
    dispatchKey("keydown", "KeyW");
    dispatchKey("keydown", "KeyD");
    const state = input.getState();
    expect(state.throttle).toBe(1);
    expect(state.steer).toBe(1);
  });
});
