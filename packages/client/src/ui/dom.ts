// ─── Reactive DOM helpers ─────────────────────────────────────────────────────

export interface Signal<T> {
  get(): T;
  set(value: T): void;
  subscribe(fn: (value: T) => void): () => void;
}

/**
 * Creates a reactive signal with an initial value.
 * Returns an object with `get`, `set`, and `subscribe` methods.
 */
export function signal<T>(initial: T): Signal<T> {
  let _value = initial;
  const _subscribers: Array<(value: T) => void> = [];

  return {
    get(): T {
      return _value;
    },

    set(value: T): void {
      _value = value;
      for (const fn of _subscribers.slice()) {
        try {
          fn(value);
        } catch (err) {
          console.error("[signal] subscriber error:", err);
        }
      }
    },

    subscribe(fn: (value: T) => void): () => void {
      _subscribers.push(fn);
      // Call immediately with current value
      fn(_value);
      return () => {
        const idx = _subscribers.indexOf(fn);
        if (idx !== -1) {
          _subscribers.splice(idx, 1);
        }
      };
    },
  };
}

// ─── Element factory ──────────────────────────────────────────────────────────

type AttrValue = string | number | boolean | Record<string, string | number> | EventListenerOrEventListenerObject | null | undefined;

/**
 * Tiny element factory.
 * Handles:
 *   - `onClick` → addEventListener('click', ...)
 *   - `onChange` → addEventListener('change', ...)
 *   - `onInput` → addEventListener('input', ...)
 *   - `onKeydown` → addEventListener('keydown', ...)
 *   - `className` → el.className
 *   - `style` as object → el.style properties
 *   - All other string/number attrs → setAttribute
 */
export function h(
  tag: string,
  attrs?: Record<string, AttrValue> | null,
  ...children: Array<Node | string>
): HTMLElement {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) {
        continue;
      }

      // Event handlers: onClick, onChange, onInput, onFocus, onBlur, onKeydown, etc.
      if (key.startsWith("on") && key.length > 2) {
        const eventName = key[2].toLowerCase() + key.slice(3);
        el.addEventListener(eventName, value as EventListenerOrEventListenerObject);
        continue;
      }

      if (key === "className") {
        el.className = String(value);
        continue;
      }

      if (key === "style" && typeof value === "object") {
        const styleObj = value as Record<string, string | number>;
        for (const [prop, val] of Object.entries(styleObj)) {
          (el.style as unknown as Record<string, string>)[prop] = String(val);
        }
        continue;
      }

      if (typeof value === "boolean") {
        if (value) {
          el.setAttribute(key, "");
        }
        continue;
      }

      el.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (typeof child === "string") {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  }

  return el;
}

// ─── Mount helper ─────────────────────────────────────────────────────────────

/**
 * Appends `el` to `parent`.
 */
export function mount(el: Node, parent: Node): void {
  parent.appendChild(el);
}

// ─── Reactive text node ───────────────────────────────────────────────────────

/**
 * Creates a Text node that automatically updates when the signal changes.
 * Returns an object containing the text node and an unsub function so callers
 * can clean up the subscription when the element is removed.
 */
export function text(sig: Signal<string | number>): Text {
  const node = document.createTextNode(String(sig.get()));
  // Subscribe and keep reference to unsub so GC doesn't collect it while node is alive
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _unsub = sig.subscribe((v) => {
    node.textContent = String(v);
  });
  // Attach unsub to node so it can be called externally if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (node as any).__unsub = _unsub;
  return node;
}
