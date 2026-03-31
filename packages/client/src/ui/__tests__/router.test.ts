/**
 * Tests for hash Router
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "../router.js";

// jsdom provides location / window in vitest client environment

describe("Router", () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
    // Reset hash before each test
    location.hash = "";
  });

  it("matches root '/' when hash is empty", () => {
    const handler = vi.fn();
    router.on("/", handler);
    location.hash = "";
    router.start();
    expect(handler).toHaveBeenCalledWith({});
  });

  it("matches root '/' when hash is '#/'", () => {
    const handler = vi.fn();
    router.on("/", handler);
    location.hash = "#/";
    router.start();
    expect(handler).toHaveBeenCalledWith({});
  });

  it("extracts a single param from /r/:slug", () => {
    const handler = vi.fn();
    router.on("/r/:slug", handler);
    location.hash = "#/r/neon-wolf-42";
    router.start();
    expect(handler).toHaveBeenCalledWith({ slug: "neon-wolf-42" });
  });

  it("extracts param from /watch/:roomId", () => {
    const handler = vi.fn();
    router.on("/watch/:roomId", handler);
    location.hash = "#/watch/room-abc";
    router.start();
    expect(handler).toHaveBeenCalledWith({ roomId: "room-abc" });
  });

  it("does not match a different pattern", () => {
    const handler = vi.fn();
    router.on("/r/:slug", handler);
    location.hash = "#/watch/something";
    router.start();
    expect(handler).not.toHaveBeenCalled();
  });

  it("navigate() sets location.hash", () => {
    router.navigate("/r/my-room");
    expect(location.hash).toBe("#/r/my-room");
  });

  it("fires handler on hashchange", async () => {
    const handler = vi.fn();
    router.on("/r/:slug", handler);
    location.hash = "#/"; // start at root
    router.start();

    // Simulate navigation
    location.hash = "#/r/turbo-hawk-55";
    window.dispatchEvent(new Event("hashchange"));

    expect(handler).toHaveBeenCalledWith({ slug: "turbo-hawk-55" });
  });

  it("calls the correct handler when multiple routes registered", () => {
    const rootHandler = vi.fn();
    const roomHandler = vi.fn();
    router.on("/", rootHandler);
    router.on("/r/:slug", roomHandler);

    location.hash = "#/r/ghost-rider-11";
    router.start();

    expect(rootHandler).not.toHaveBeenCalled();
    expect(roomHandler).toHaveBeenCalledWith({ slug: "ghost-rider-11" });
  });
});
