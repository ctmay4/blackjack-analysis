import { describe, expect, it } from "vitest";
import {
  betUnits,
  defaultRamp,
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
