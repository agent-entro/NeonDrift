/**
 * Tests for security headers middleware and sanitizeDisplayName.
 */
import { describe, it, expect } from "vitest";
import { sanitizeDisplayName } from "../middleware/securityHeaders.js";

describe("sanitizeDisplayName", () => {
  it("strips HTML special characters", () => {
    expect(sanitizeDisplayName("<script>alert(1)</script>")).not.toContain("<");
    expect(sanitizeDisplayName('<img src="x" onerror="1">')).not.toContain('"');
  });

  it("trims whitespace and collapses internal spaces", () => {
    expect(sanitizeDisplayName("  hello   world  ")).toBe("hello world");
  });

  it("limits to 20 characters", () => {
    const long = "a".repeat(50);
    expect(sanitizeDisplayName(long)).toHaveLength(20);
  });

  it("allows normal names", () => {
    expect(sanitizeDisplayName("CoolRacer99")).toBe("CoolRacer99");
  });

  it("strips backticks", () => {
    expect(sanitizeDisplayName("foo`bar")).toBe("foobar");
  });

  it("returns fallback for empty string (satisfies DB 3-char minimum)", () => {
    const result = sanitizeDisplayName("");
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result).toBe("Racer");
  });

  it("pads names shorter than 3 chars to meet DB constraint", () => {
    const result = sanitizeDisplayName("AB");
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result).toBe("AB_");
  });

  it("handles single-character name", () => {
    const result = sanitizeDisplayName("X");
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result).toBe("X__");
  });

  it("handles non-string input gracefully", () => {
    // Defensive: coerces to string
    const result = sanitizeDisplayName(null as unknown as string);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("never produces name violating DB constraint (3-20 chars)", () => {
    const inputs = ["", "A", "AB", "Normal", "x".repeat(100), "<>&\"'`"];
    for (const input of inputs) {
      const result = sanitizeDisplayName(input);
      expect(result.length, `input: ${JSON.stringify(input)}`).toBeGreaterThanOrEqual(3);
      expect(result.length, `input: ${JSON.stringify(input)}`).toBeLessThanOrEqual(20);
    }
  });
});

describe("rateLimit re-export", () => {
  it("sanitizeDisplayName is re-exported from rateLimit for backwards compat", async () => {
    const { sanitizeDisplayName: fn } = await import("../middleware/rateLimit.js");
    expect(typeof fn).toBe("function");
    // Should work identically
    expect(fn("hello")).toBe("hello");
  });
});
