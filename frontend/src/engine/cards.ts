import type { CardData, CardRank, CardSuit } from "./types";

const ranks: readonly CardRank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];
const suits: readonly CardSuit[] = ["♠", "♥", "♦", "♣"];
export type RandomSource = () => number;
export interface StatefulRandom extends RandomSource {
  getState(): number;
  setState(value: number): void;
}

export function physicalCard(rank: CardRank, suit: CardSuit = ""): CardData {
  if (!ranks.includes(rank) || ![...suits, ""].includes(suit))
    throw new Error("invalid card");
  return Object.freeze({
    rank,
    suit,
    value:
      rank === "A" ? 11 : ["J", "Q", "K"].includes(rank) ? 10 : Number(rank),
  });
}
export function cardFromValue(value: number): CardData {
  if (!Number.isInteger(value) || value < 2 || value > 11)
    throw new Error(`invalid card value: ${value}`);
  return physicalCard(value === 11 ? "A" : (String(value) as CardRank));
}
export function evaluateHand(cards: readonly number[]) {
  let total = 0,
    aces = 0,
    softTotal = 0;
  for (const value of cards) {
    if (!Number.isInteger(value) || value < 2 || value > 11)
      throw new Error(`invalid card value: ${value}`);
    total += value;
    softTotal += value === 11 ? 1 : value;
    if (value === 11) aces++;
  }
  for (let index = 0; index < aces && total > 21; index++) total -= 10;
  return {
    total,
    softTotal,
    aces,
    soft: total === softTotal + 10,
    bust: total > 21,
    blackjack: cards.length === 2 && total === 21,
    canSplit: cards.length === 2 && cards[0] === cards[1],
  };
}

/** Stable JS seed for reproducible tests, not Python's random/shuffle algorithm. */
export function seededRandom(seed: number): StatefulRandom {
  if (!Number.isSafeInteger(seed))
    throw new Error("seed must be a safe integer");
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  random.getState = () => state;
  random.setState = (value: number) => {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
      throw new Error("invalid random state");
    state = value;
  };
  return random;
}

/** Draws from the END of the supplied array, matching the reference test shoes. */
export class Shoe {
  private readonly cards: CardData[];
  constructor(cards: readonly (CardData | number)[]) {
    this.cards = cards.map((card) => {
      if (typeof card === "number") return cardFromValue(card);
      const result = physicalCard(card.rank, card.suit);
      if (result.value !== card.value)
        throw new Error("card rank/value mismatch");
      return result;
    });
  }
  static shuffled(decks = 8, random: RandomSource = Math.random): Shoe {
    if (!Number.isInteger(decks) || decks < 1)
      throw new Error("decks must be a positive integer");
    const cards: CardData[] = [];
    for (let deck = 0; deck < decks; deck++) {
      for (const suit of suits)
        for (const rank of ranks) cards.push(physicalCard(rank, suit));
    }
    for (let index = cards.length - 1; index > 0; index--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new Error("random source must return a value in [0, 1)");
      const other = Math.floor(value * (index + 1));
      [cards[index], cards[other]] = [cards[other], cards[index]];
    }
    return new Shoe(cards);
  }
  get length(): number {
    return this.cards.length;
  }
  get values(): number[] {
    return this.cards.map((card) => card.value);
  }
  draw(): CardData {
    const card = this.cards.pop();
    if (!card) throw new Error("shoe ran out of cards");
    return card;
  }
  snapshot(): CardData[] {
    return this.cards.map((card) => ({ ...card }));
  }
  clone(): Shoe {
    return new Shoe(this.cards);
  }
}
