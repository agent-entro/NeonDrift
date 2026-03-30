import { describe, it, expect } from "vitest";
import { XP_PER_TIER, TICK_RATE, TICK_MS, MAX_PLAYERS, ELO_BRACKETS } from "../constants.js";

describe("constants", () => {
  it("TICK_MS is 1000/TICK_RATE", () => {
    expect(TICK_MS).toBe(1000 / TICK_RATE);
  });

  it("has 30 XP tiers", () => {
    expect(XP_PER_TIER).toHaveLength(30);
  });

  it("XP tiers cumulate to 10500", () => {
    const total = XP_PER_TIER.reduce((s, v) => s + v, 0);
    expect(total).toBe(10_500);
  });

  it("MAX_PLAYERS is 8", () => {
    expect(MAX_PLAYERS).toBe(8);
  });

  it("ELO brackets cover full range", () => {
    expect(ELO_BRACKETS[0].min).toBe(0);
    expect(ELO_BRACKETS[ELO_BRACKETS.length - 1].max).toBe(Infinity);
  });
});
