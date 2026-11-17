import { describe, expect, it } from "vitest";
import {
  betUnits,
  defaultRamp,
  defaultSimulationRules,
  simulationRules,
  deviationAction,
  deviations,
  estimate,
  hiLo,
  simulateBlock,
  validateRamp,
  validateSimulation,
} from "./advanced-practice";

describe("advanced practice stays separate from basic strategy", () => {
  it.each([
    [-3, 1],
    [-0.5, 1],
    [0, 1],
    [0.99, 1],
    [1, 1],
    [1.99, 1],
    [2, 2],
    [3.99, 4],
    [4, 8],
    [9, 8],
  ])("maps true count %s to %s ramp units", (tc, units) => {
    expect(betUnits(tc, defaultRamp)).toBe(units);
  });
  it("supports custom ramps and validates every boundary", () => {
    expect(betUnits(2.5, [2, 3, 5, 7, 9])).toBe(5);
    for (const ramp of [
      [],
      [1, 2, 3, 4],
      [1, 2, 3, 4, 101],
      [1, 2, 1, 4, 8],
      [0, 1, 2, 4, 8],
      [1, 1, 2, 4, NaN],
      [1, 1, 2, 4, 8.5],
    ])
      expect(() => validateRamp(ramp)).toThrow();
    expect(() => betUnits(Infinity, defaultRamp)).toThrow();
  });
  it.each(deviations)(
    "includes equality at the index: $hand vs $dealer",
    ({ index }) => {
      expect(deviationAction(index, index - 0.01)).toBe("hit");
      expect(deviationAction(index, index)).toBe("stand");
      expect(deviationAction(index, index + 1)).toBe("stand");
    },
  );
  it("uses Hi-Lo tags, including zero-sum full decks", () => {
    expect(
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11].reduce(
        (n, c) => n + hiLo(c),
        0,
      ),
    ).toBe(0);
  });
  it("rejects invalid and excessive worker workloads", () => {
    for (const input of [
      { seed: -1, blocks: 20 },
      { seed: 1.1, blocks: 20 },
      { seed: 2 ** 32, blocks: 20 },
      { seed: 42, blocks: 19 },
      { seed: 42, blocks: 201 },
      { seed: 42, blocks: NaN },
    ])
      expect(() =>
        validateSimulation({ ...input, ramp: defaultRamp }),
      ).toThrow();
    expect(() =>
      validateSimulation({ seed: 42, blocks: 20, ramp: defaultRamp }),
    ).not.toThrow();
  });
  it("validates simulation rules and keeps defaults compatible", () => {
    expect(simulationRules()).toEqual(defaultSimulationRules);
    for (const rules of [
      { decks: 1 },
      { decks: 9 },
      { penetration: 0.09 },
      { penetration: 0.51 },
      { max_splits: 4 },
      { max_splits: -1 },
      { dealer_hits_soft_17: "true" as unknown as boolean },
    ])
      expect(() =>
        validateSimulation({ seed: 42, blocks: 20, ramp: defaultRamp, rules }),
      ).toThrow();
  });
  it.each([2, 4, 6, 8])(
    "settles reproducibly with custom %s-deck rules",
    (decks) => {
      for (const dealer_hits_soft_17 of [false, true]) {
        const rules = {
          decks,
          dealer_hits_soft_17,
          allow_surrender: true,
          double_after_split: false,
          resplit_aces: false,
          one_card_on_split_aces: false,
          max_splits: 3,
          penetration: 0.1,
        };
        const value = simulateBlock("basic-flat", 17, defaultRamp, rules);
        expect(Number.isFinite(value)).toBe(true);
        expect(simulateBlock("basic-flat", 17, defaultRamp, rules)).toBe(value);
        expect(simulateBlock("basic-ramp", 17, [2, 2, 2, 2, 2], rules)).toBe(
          value * 2,
        );
      }
    },
  );
  it("reports independent-block mean and uncertainty", () => {
    const result = estimate([1, 2, 3]);
    expect(result.mean).toBe(2);
    expect(result.low).toBeCloseTo(2 - 1.96 / Math.sqrt(3));
    expect(result.high).toBeCloseTo(2 + 1.96 / Math.sqrt(3));
    expect(estimate([4, 4]).low).toBe(4);
    expect(() => estimate([1])).toThrow();
    expect(() => estimate([1, NaN])).toThrow();
  });
  it("reproduces simulations and a flat ramp exactly", () => {
    const basic = simulateBlock("basic-flat", 42, defaultRamp);
    expect(simulateBlock("basic-flat", 42, defaultRamp)).toBe(basic);
    expect(simulateBlock("basic-ramp", 42, [1, 1, 1, 1, 1])).toBe(basic);
    expect(simulateBlock("basic-ramp", 42, [2, 2, 2, 2, 2])).toBe(basic * 2);
    expect(Number.isFinite(simulateBlock("stand-flat", 42, defaultRamp))).toBe(
      true,
    );
  });
  it("basic flat play outperforms always standing over a reproducible sample", () => {
    let basic = 0,
      stand = 0;
    for (let seed = 0; seed < 40; seed++) {
      basic += simulateBlock("basic-flat", seed, defaultRamp);
      stand += simulateBlock("stand-flat", seed, defaultRamp);
    }
    expect(basic).toBeGreaterThan(stand);
  });
});
