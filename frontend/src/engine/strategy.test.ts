import { expect, it } from "vitest";
import { parseStrategy, Strategy } from "./strategy";

it("retains H17/S17 differences and fallback actions", () => {
  const stand = new Strategy("stand_soft_17"),
    hit = new Strategy("hit_soft_17");
  expect(stand.decide(6, [11, 8])).toBe("stand");
  expect(hit.decide(6, [11, 8])).toBe("double");
  expect(hit.decide(6, [11, 8], { canDouble: false })).toBe("stand");
  expect(stand.decide(10, [5, 6], { canDouble: false })).toBe("hit");
  expect(stand.decide(10, [10, 6])).toBe("hit");
  expect(stand.decide(10, [10, 6, 10])).toBe("stand");
});

it("honors surrender eligibility and pair restrictions", () => {
  const strategy = new Strategy("hit_soft_17", { allowSurrender: true });
  expect(strategy.decide(10, [10, 6])).toBe("surrender");
  expect(strategy.decide(10, [10, 6], { firstTurn: false })).toBe("hit");
  expect(strategy.decide(10, [8, 8], { canSplit: false })).toBe("surrender");
  expect(strategy.decide(6, [8, 8], { canSplit: false })).toBe("stand");
  expect(
    new Strategy("stand_soft_17", { doubleAfterSplit: false }).decide(
      5,
      [4, 4],
    ),
  ).toBe("hit");
});

it("explains the decision with player category, total, and dealer upcard", () => {
  expect(new Strategy().recommend(10, [10, 6])).toEqual({
    action: "hit",
    handKind: "hard",
    playerTotal: 16,
    dealerCard: 10,
    explanation:
      "Basic strategy recommends hit with hard 16 against dealer 10.",
  });
  expect(new Strategy().recommend(11, [8, 8]).explanation).toContain(
    "pair of 8s against dealer A",
  );
  expect(
    new Strategy().recommend(6, [8, 8], { canSplit: false }).handKind,
  ).toBe("hard");
});

it("rejects malformed resources and invalid upcards rather than inventing moves", () => {
  for (const source of [
    "2 H",
    "[hard]\n4 H H H H H H H H H X",
    "[hard]\n4 H H H H H H H H H H",
    "[unknown]\n4 H H H H H H H H H H",
  ])
    expect(() => parseStrategy(source)).toThrow();
  expect(() => new Strategy().decide(1, [10, 6])).toThrow("upcard");
  expect(() => new Strategy().decide(10, [])).toThrow("Unable to decide");
});
