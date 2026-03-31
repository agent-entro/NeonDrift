/**
 * Tests for reactive DOM helpers: signal, h, mount, text
 */
import { describe, it, expect, vi } from "vitest";
import { signal, h, mount, text } from "../dom.js";

describe("signal", () => {
  it("returns initial value via get()", () => {
    const s = signal(42);
    expect(s.get()).toBe(42);
  });

  it("updates value via set()", () => {
    const s = signal("hello");
    s.set("world");
    expect(s.get()).toBe("world");
  });

  it("calls subscriber immediately on subscribe", () => {
    const s = signal(10);
    const fn = vi.fn();
    s.subscribe(fn);
    expect(fn).toHaveBeenCalledWith(10);
  });

  it("calls subscriber on set", () => {
    const s = signal(0);
    const fn = vi.fn();
    s.subscribe(fn);
    fn.mockClear();
    s.set(99);
    expect(fn).toHaveBeenCalledWith(99);
  });

  it("unsubscribe stops calls", () => {
    const s = signal("a");
    const fn = vi.fn();
    const unsub = s.subscribe(fn);
    fn.mockClear();
    unsub();
    s.set("b");
    expect(fn).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers", () => {
    const s = signal(1);
    const a = vi.fn();
    const b = vi.fn();
    s.subscribe(a);
    s.subscribe(b);
    a.mockClear();
    b.mockClear();
    s.set(2);
    expect(a).toHaveBeenCalledWith(2);
    expect(b).toHaveBeenCalledWith(2);
  });
});

describe("h()", () => {
  it("creates an element with the given tag", () => {
    const el = h("div");
    expect(el.tagName).toBe("DIV");
  });

  it("sets className", () => {
    const el = h("span", { className: "foo bar" });
    expect(el.className).toBe("foo bar");
  });

  it("sets string attributes", () => {
    const el = h("input", { type: "text", placeholder: "Name" });
    expect(el.getAttribute("type")).toBe("text");
    expect(el.getAttribute("placeholder")).toBe("Name");
  });

  it("attaches event listener via onClick", () => {
    const handler = vi.fn();
    const el = h("button", { onClick: handler }, "Click me");
    el.click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("applies inline styles from object", () => {
    const el = h("div", { style: { color: "red", fontSize: "16px" } });
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });

  it("appends string children as text nodes", () => {
    const el = h("p", null, "Hello");
    expect(el.textContent).toBe("Hello");
  });

  it("appends element children", () => {
    const child = h("span", null, "child");
    const parent = h("div", null, child);
    expect(parent.firstChild).toBe(child);
  });

  it("skips null/undefined attrs", () => {
    const el = h("div", { id: null, title: undefined });
    expect(el.getAttribute("id")).toBeNull();
    expect(el.getAttribute("title")).toBeNull();
  });
});

describe("mount()", () => {
  it("appends element to parent", () => {
    const parent = document.createElement("div");
    const child = h("span");
    mount(child, parent);
    expect(parent.contains(child)).toBe(true);
  });
});

describe("text()", () => {
  it("creates a text node with the initial value", () => {
    const s = signal("initial");
    const node = text(s);
    expect(node.textContent).toBe("initial");
  });

  it("updates text node when signal changes", () => {
    const s = signal(0);
    const node = text(s);
    s.set(42);
    expect(node.textContent).toBe("42");
  });
});
