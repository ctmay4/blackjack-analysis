import { describe, expect, it } from "vitest";
import { evaluateHand, physicalCard, seededRandom, Shoe } from "./cards";
import { BlackjackGame, handValue } from "./game";
import { tableRules } from "./types";
import type { Action, Rules } from "./types";

function game(cards: number[], rules: Partial<Rules> = {}) {
  const result = new BlackjackGame(rules, new Shoe(cards));
  result.startRound(25);
  return result;
}

describe("cards, shoes, and hand values", () => {
  it.each([
    [[11, 8], 19, true],
    [[11, 2, 11], 14, true],
    [[11, 11, 11], 13, true],
    [[10, 4, 11], 15, false],
    [[10, 6, 11, 11], 18, false],
    [[10, 6, 4, 11, 11], 22, false],
  ])("evaluates %j as %i (soft: %s)", (cards, total, soft) => {
    expect(evaluateHand(cards)).toMatchObject({
      total,
      soft,
      bust: total > 21,
    });
  });
  it("distinguishes two-card naturals from longer 21s", () => {
    expect(evaluateHand([11, 10]).blackjack).toBe(true);
    expect(evaluateHand([11, 5, 5]).blackjack).toBe(false);
    expect(evaluateHand([10, 10]).canSplit).toBe(true);
  });
  it("creates physical rank/suit cards and rejects inconsistent input", () => {
    expect(physicalCard("K", "♥")).toEqual({ rank: "K", suit: "♥", value: 10 });
    expect(() => new Shoe([{ rank: "A", suit: "♠", value: 1 }])).toThrow(
      "mismatch",
    );
    expect(() => new Shoe([1])).toThrow();
    expect(() => evaluateHand([NaN])).toThrow();
  });
  it("draws from the end without mutating the caller's shoe or card data", () => {
    const cards = [2, 3, 4];
    const shoe = new Shoe(cards);
    expect(shoe.draw().value).toBe(4);
    expect(cards).toEqual([2, 3, 4]);
    const clone = shoe.clone();
    clone.draw();
    expect(shoe.length).toBe(2);
  });
  it("has all physical cards in each shuffled deck and stable local seeds", () => {
    const first = Shoe.shuffled(2, seededRandom(123));
    const second = Shoe.shuffled(2, seededRandom(123));
    expect(first.values).toEqual(second.values);
    const counts = new Map<string, number>();
    while (first.length) {
      const card = first.draw();
      const key = card.rank + card.suit;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(52);
    expect([...counts.values()].every((count) => count === 2)).toBe(true);
  });
  it("validates rules, random sources, and empty shoes", () => {
    expect(() => tableRules({ decks: 0 })).toThrow();
    expect(() => tableRules({ decks: 1.5 })).toThrow();
    expect(() => tableRules({ penetration: NaN })).toThrow();
    expect(() => tableRules({ penetration: 1 })).toThrow();
    expect(() => tableRules({ max_splits: -1 })).toThrow();
    expect(() => Shoe.shuffled(1, () => 1)).toThrow();
    expect(() => new Shoe([]).draw()).toThrow("ran out");
  });
});

describe("step-driven game", () => {
  it("exposes the whole engine state; the presentation layer must mask the hole card", () => {
    const result = game([7, 6, 10, 10]);
    expect(result.round!.dealerCards.map((card) => card.value)).toEqual([
      10, 7,
    ]);
    expect(result.round!.hands[0].cards.map((card) => card.value)).toEqual([
      10, 6,
    ]);
  });
  it("double draws one card, doubles the bet, and ends the hand", () => {
    const result = game([5, 10, 10, 6, 5, 6]);
    result.apply("double");
    expect(result.round!.status).toBe("complete");
    expect(result.round!.result!.hands[0]).toMatchObject({
      bet: 50,
      outcome: "push",
      doubled: true,
    });
    expect(result.round!.hands[0].cards).toHaveLength(3);
  });
  it("does not finish a non-busting hit", () => {
    const result = game([10, 7, 2, 11, 10]);
    result.apply("hit");
    expect(result.round!.status).toBe("player_turn");
    expect(handValue(result.activeHand!).total).toBe(13);
    expect(result.availableActions).toContain("hit");
    expect(result.availableActions).not.toContain("double");
  });
  it("only offers late surrender on the opening unsplit hand", () => {
    const result = game([10, 7, 2, 11, 10], { allow_surrender: true });
    expect(result.availableActions).toContain("surrender");
    result.apply("hit");
    expect(result.availableActions).not.toContain("surrender");
  });
  it("surrender loses half the wager", () => {
    const result = game([7, 6, 10, 10], { allow_surrender: true });
    result.apply("surrender");
    expect(result.round!.result!.profit).toBe(-12.5);
    expect(result.round!.result!.hands[0].outcome).toBe("surrender");
  });
  it("pays a natural 3:2 but pushes two naturals", () => {
    expect(game([7, 10, 11, 6]).round!.result!.profit).toBe(37.5);
    expect(game([10, 10, 11, 11]).round!.result!.profit).toBe(0);
    expect(game([10, 9, 10, 11]).round!.result!.profit).toBe(-25);
  });
  it("a split 21 is not a natural", () => {
    const result = game([4, 10, 10, 7, 11, 11, 6]);
    result.apply("split");
    expect(result.round!.status).toBe("complete");
    expect(result.round!.result!.profit).toBe(50);
    expect(result.round!.result!.hands.map((hand) => hand.profit)).toEqual([
      25, 25,
    ]);
  });
  it("switches between S17 and H17 dealer behavior", () => {
    for (const hits of [false, true]) {
      const result = game([2, 11, 10, 7, 6], { dealer_hits_soft_17: hits });
      result.apply("stand");
      expect(result.round!.dealerCards).toHaveLength(hits ? 3 : 2);
    }
  });
  it("plays split hands in order and respects no double-after-split", () => {
    const result = game([5, 2, 3, 10, 8, 8, 6], { double_after_split: false });
    result.apply("split");
    expect(result.round!.hands).toHaveLength(2);
    expect(result.availableActions).not.toContain("double");
    expect(result.activeHand!.cards.map((card) => card.value)).toEqual([8, 3]);
    result.apply("stand");
    expect(result.activeHand!.cards.map((card) => card.value)).toEqual([8, 2]);
    result.apply("stand");
    expect(result.round!.result!.hands).toHaveLength(2);
  });
  it("allows three resplits, not four", () => {
    const result = game([2, 8, 8, 8, 8, 8, 8, 10, 8, 8, 6]);
    for (let count = 1; count <= 3; count++) {
      result.apply("split");
      expect(result.round!.splitsUsed).toBe(count);
    }
    expect(result.availableActions).not.toContain("split");
    for (let index = 0; index < 4; index++) result.apply("stand");
    expect(result.round!.result!.hands).toHaveLength(4);
  });
  it("allows consecutive rounds only after settlement", () => {
    const result = game([7, 6, 10, 10, 7, 6, 10, 10]);
    expect(() => result.startRound()).toThrow("not complete");
    result.apply("stand");
    result.startRound();
    expect(result.round!.status).toBe("player_turn");
  });
});

describe("explicit ace-rule corrections to the Python baseline", () => {
  it("allows an initial A/A split even with re-splitting disabled", () => {
    const result = game([5, 8, 9, 10, 11, 11, 6], { resplit_aces: false });
    expect(result.availableActions).toContain("split");
    result.apply("split");
    expect(result.round!.status).toBe("complete");
    expect(result.round!.hands.every((hand) => hand.cards.length === 2)).toBe(
      true,
    );
  });
  it("allows re-splitting newly paired aces but not hits/doubles under one-card rules", () => {
    const result = game([5, 4, 3, 2, 11, 10, 11, 11, 6]);
    result.apply("split");
    expect(result.availableActions).toEqual(["split", "stand"]);
    result.apply("split");
    expect(result.round!.status).toBe("complete");
    expect(result.round!.hands).toHaveLength(3);
    expect(result.round!.hands.every((hand) => hand.cards.length === 2)).toBe(
      true,
    );
  });
  it("settles new ace pairs when re-splitting is disabled or the limit is reached", () => {
    for (const rules of [{ resplit_aces: false }, { max_splits: 1 }]) {
      const result = game([5, 8, 11, 10, 11, 11, 6], rules);
      result.apply("split");
      expect(result.round!.status).toBe("complete");
      expect(result.round!.hands).toHaveLength(2);
    }
  });
  it("allows ordinary play on split aces when the one-card restriction is disabled", () => {
    const result = game([5, 5, 2, 3, 10, 11, 11, 6], {
      one_card_on_split_aces: false,
    });
    result.apply("split");
    expect(result.availableActions).toEqual(["double", "hit", "stand"]);
    result.apply("double");
    result.apply("stand");
    expect(result.round!.status).toBe("complete");
    expect(result.round!.hands[0].bet).toBe(50);
  });
});

describe("failure atomicity", () => {
  it("rejects invalid actions without changing state", () => {
    const result = game([7, 6, 10, 10]);
    const before = structuredClone(result.round);
    expect(() => result.apply("split")).toThrow("not available");
    expect(() => result.apply("unknown" as Action)).toThrow("not available");
    expect(result.round).toEqual(before);
  });
  it("rolls back incomplete opening deals", () => {
    const result = new BlackjackGame({}, new Shoe([2, 3, 4]));
    expect(() => result.startRound()).toThrow("ran out");
    expect(result.round).toBeNull();
    expect(result.shoe.values).toEqual([2, 3, 4]);
  });
  it("rolls back doubling and dealer draws on shoe exhaustion", () => {
    for (const action of ["stand", "double"] as const) {
      const result = game([2, 6, 10, 2]);
      const before = structuredClone(result.round),
        shoe = result.shoe.values;
      expect(() => result.apply(action)).toThrow("ran out");
      expect(result.round).toEqual(before);
      expect(result.shoe.values).toEqual(shoe);
    }
  });
  it("rejects nonfinite and nonpositive wagers", () => {
    const result = new BlackjackGame({}, new Shoe([7, 6, 10, 10]));
    for (const bet of [0, -1, NaN, Infinity])
      expect(() => result.startRound(bet)).toThrow();
    expect(result.shoe.length).toBe(4);
    expect(result.round).toBeNull();
  });
});
