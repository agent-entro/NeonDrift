import { describe, it, expect } from "vitest";
import { sanitizeDisplayName } from "../middleware/rateLimit.js";

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
});
