/** Domain contracts. No React, HTTP, storage, or browser dependencies. */
export type Action = "hit" | "stand" | "double" | "split" | "surrender";
export type CardRank =
  "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type CardSuit = "♠" | "♥" | "♦" | "♣" | "";
export interface CardData {
  rank: CardRank;
  suit: CardSuit;
  value: number;
}
export interface Rules {
  decks: number;
  penetration: number;
  dealer_hits_soft_17: boolean;
  allow_surrender: boolean;
  double_after_split: boolean;
  max_splits: number;
  resplit_aces: boolean;
  one_card_on_split_aces: boolean;
}
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  decks: 8,
  penetration: 0.25,
  dealer_hits_soft_17: false,
  allow_surrender: false,
  double_after_split: true,
  max_splits: 3,
  resplit_aces: true,
  one_card_on_split_aces: true,
});
export function tableRules(input: Partial<Rules> = {}): Readonly<Rules> {
  const rules = { ...DEFAULT_RULES, ...input };
  if (!Number.isInteger(rules.decks) || rules.decks < 1)
    throw new Error("decks must be a positive integer");
  if (
    !Number.isFinite(rules.penetration) ||
    rules.penetration <= 0 ||
    rules.penetration >= 1
  )
    throw new Error("penetration must be between 0 and 1");
  if (!Number.isInteger(rules.max_splits) || rules.max_splits < 0)
    throw new Error("max_splits must be a nonnegative integer");
  for (const key of [
    "dealer_hits_soft_17",
    "allow_surrender",
    "double_after_split",
    "resplit_aces",
    "one_card_on_split_aces",
  ] as const) {
    if (typeof rules[key] !== "boolean")
      throw new Error(`${key} must be boolean`);
  }
  return Object.freeze(rules);
}
export interface PlayerHand {
  cards: CardData[];
  bet: number;
  splitHand: boolean;
  firstTurn: boolean;
  finished: boolean;
  surrendered: boolean;
  doubled: boolean;
}
export type Outcome = "win" | "loss" | "push" | "surrender";
export interface HandResult {
  outcome: Outcome;
  bet: number;
  profit: number;
  cards: CardData[];
  splitHand: boolean;
  doubled: boolean;
}
export interface RoundResult {
  hands: HandResult[];
  dealerCards: CardData[];
  dealerBust: boolean;
  dealerBlackjack: boolean;
  profit: number;
}
interface RoundBase {
  dealerCards: CardData[];
  hands: PlayerHand[];
  splitsUsed: number;
}
export interface PlayingRound extends RoundBase {
  status: "player_turn";
  activeHandIndex: number;
  result: null;
}
export interface CompletedRound extends RoundBase {
  status: "complete";
  activeHandIndex: null;
  result: RoundResult;
}
export type RoundState = PlayingRound | CompletedRound;
export interface Recommendation {
  action: Action;
  handKind: "hard" | "soft" | "pair";
  playerTotal: number;
  dealerCard: number;
  explanation: string;
}
