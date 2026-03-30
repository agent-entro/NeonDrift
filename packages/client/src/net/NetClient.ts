import { pack, unpack } from "msgpackr";
import type { ClientMessage, ServerMessage } from "@neondrift/shared";

type MessageHandler = (msg: ServerMessage) => void;

export class NetClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: MessageHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnects = 3;
  private reconnectDelay = 1000;
  private connected = false;
  private pendingMessages: ClientMessage[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = "arraybuffer";
      this.ws.addEventListener("open", () => this.handleOpen());
      this.ws.addEventListener("message", (evt) => this.handleMessage(evt.data));
      this.ws.addEventListener("close", () => this.handleClose());
      this.ws.addEventListener("error", (evt) => this.handleError(evt));
    } catch (err) {
      console.error("[NetClient] failed to connect:", err);
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnects; // prevent reconnect
    this.connected = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(msg: ClientMessage): void {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(msg);
      return;
    }

    try {
      this.ws.send(pack(msg));
    } catch (err) {
      console.error("[NetClient] send error:", err);
    }
  }

  /**
   * Register a message handler. Returns an unsubscribe function.
   */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleOpen(): void {
    console.log("[NetClient] connected");
    this.connected = true;
    this.reconnectAttempts = 0;
    this.flushPending();
  }

  private handleMessage(data: ArrayBuffer | Blob | Buffer): void {
    let buf: ArrayBuffer | Buffer;

    if (data instanceof Blob) {
      data.arrayBuffer().then((ab) => this.handleMessage(ab));
      return;
    }

    buf = data;

    let msg: ServerMessage;
    try {
      msg = unpack(new Uint8Array(buf as ArrayBuffer)) as ServerMessage;
    } catch (err) {
      console.error("[NetClient] failed to parse message:", err);
      return;
    }

    for (const handler of this.handlers) {
      try {
        handler(msg);
      } catch (err) {
        console.error("[NetClient] message handler error:", err);
      }
    }
  }

  private handleClose(): void {
    console.log("[NetClient] disconnected");
    this.connected = false;
    this.ws = null;
    this.scheduleReconnect();
  }

  private handleError(err: Event): void {
    console.error("[NetClient] websocket error:", err);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnects) {
      console.warn("[NetClient] max reconnects reached, giving up");
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    console.log(`[NetClient] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnects})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private flushPending(): void {
    const msgs = this.pendingMessages.splice(0);
    for (const msg of msgs) {
      this.send(msg);
    }
  }
}
