import { describe, expect, it } from "vitest";
import { seededRandom, Shoe } from "./engine/cards";
import { hiLo } from "./advanced-practice";
import {
  runningCount,
  runningCountQuestion,
  trueCount,
  trueCountQuestion,
} from "./counting-practice";

describe("Hi-Lo counting drills", () => {
  it.each([
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 1],
    [6, 1],
    [7, 0],
    [8, 0],
    [9, 0],
    [10, -1],
    [11, -1],
  ])("tags card value %s as %s", (value, tag) => {
    expect(hiLo(value)).toBe(tag);
  });

  it("counts faces and aces as minus one and a full physical deck as zero", () => {
    const cards = Shoe.shuffled(1, seededRandom(42)).snapshot();
    expect(runningCount([])).toBe(0);
    expect(runningCount(cards)).toBe(0);
    for (const rank of ["J", "Q", "K", "A"])
      expect(runningCount(cards.filter((card) => card.rank === rank))).toBe(-4);
  });

  it("generates reproducible ten-card sequences without replacement", () => {
    for (let seed = 0; seed < 100; seed++) {
      const cards = runningCountQuestion(seededRandom(seed));
      expect(cards).toEqual(runningCountQuestion(seededRandom(seed)));
      expect(cards).toHaveLength(10);
      expect(new Set(cards.map((c) => c.rank + c.suit)).size).toBe(10);
      let count = 0;
      cards.forEach((card, i) => {
        count += hiLo(card.value);
        expect(runningCount(cards.slice(0, i + 1))).toBe(count);
      });
    }
  });

  it.each([
    [5, 2, 2],
    [-5, 2, -3],
    [-1, 6, -1],
    [0, 0.5, 0],
    [6, 1.5, 4],
    [-6, 1.5, -4],
    [3, 0.5, 6],
    [-3, 0.5, -6],
    [20, 6, 3],
    [-20, 6, -4],
  ])("floors running %s / decks %s to %s", (running, decks, expected) => {
    expect(trueCount(running, decks)).toBe(expected);
  });

  it("rejects invalid count and deck inputs", () => {
    for (const running of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => trueCount(running, 2)).toThrow();
    for (const decks of [0, -1, NaN, Infinity, Number.MIN_VALUE])
      expect(() => trueCount(1, decks)).toThrow();
  });

  it("supplies positive half-deck amounts with positive, negative and zero counts", () => {
    const random = seededRandom(42);
    const counts = new Set<number>();
    const decks = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const question = trueCountQuestion(random);
      counts.add(question.running);
      decks.add(question.decks);
      expect(Number.isInteger(question.running)).toBe(true);
      expect(question.running).toBeGreaterThanOrEqual(-20);
      expect(question.running).toBeLessThanOrEqual(20);
      expect(question.decks).toBeGreaterThanOrEqual(0.5);
      expect(question.decks).toBeLessThanOrEqual(6);
      expect(Number.isInteger(question.decks * 2)).toBe(true);
    }
    expect(counts.size).toBe(41);
    expect(decks.size).toBe(12);
  });
});
