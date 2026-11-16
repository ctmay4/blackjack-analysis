import { Shoe, type RandomSource } from "./engine/cards";
import type { CardData } from "./engine/types";
import { hiLo } from "./advanced-practice";

/** A fresh single-deck sequence; no connection to the active session's shoe. */
export function runningCountQuestion(
  random: RandomSource = Math.random,
): CardData[] {
  return Shoe.shuffled(1, random).snapshot().slice(0, 10);
}

export function runningCount(cards: readonly CardData[]): number {
  return cards.reduce((sum, card) => sum + hiLo(card.value), 0);
}

/** Matches the floor convention used by the ramp and deviation exercises. */
export function trueCount(running: number, decks: number): number {
  if (!Number.isSafeInteger(running) || !Number.isFinite(decks) || decks <= 0)
    throw new Error("Use a whole running count and positive decks remaining.");
  const result = Math.floor(running / decks);
  if (!Number.isSafeInteger(result))
    throw new Error("True count is out of range.");
  return result === 0 ? 0 : result;
}

export function trueCountQuestion(random: RandomSource = Math.random) {
  return {
    running: Math.floor(random() * 41) - 20,
    decks: (Math.floor(random() * 12) + 1) / 2,
  };
}
