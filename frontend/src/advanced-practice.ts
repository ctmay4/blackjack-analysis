import { seededRandom, Shoe } from "./engine/cards";
import { BlackjackGame } from "./engine/game";
import { Strategy } from "./engine/strategy";
import type { Action } from "./engine/types";

export const indexSource =
  "https://wizardofodds.com/games/blackjack/card-counting/high-low/";
// Selected stand/hit indices only: six-deck Hi-Lo, no surrender. Not a full index system.
export const deviations = [
  { hand: [10, 6], dealer: 10, index: 0 },
  { hand: [10, 5], dealer: 10, index: 4 },
  { hand: [10, 2], dealer: 3, index: 2 },
  { hand: [10, 2], dealer: 2, index: 3 },
] as const;
export const defaultRamp = [1, 1, 2, 4, 8];
export function validateRamp(ramp: readonly number[]) {
  if (
    ramp.length !== 5 ||
    ramp.some(
      (n, i) =>
        !Number.isInteger(n) || n < 1 || n > 100 || (i > 0 && n < ramp[i - 1]),
    )
  )
    throw new Error(
      "Ramp must contain five nondecreasing whole-unit bets from 1 to 100.",
    );
}
export function betUnits(trueCount: number, ramp: readonly number[]): number {
  validateRamp(ramp);
  if (!Number.isFinite(trueCount)) throw new Error("Invalid true count.");
  return ramp[Math.max(0, Math.min(4, Math.floor(trueCount)))];
}
export function deviationAction(index: number, trueCount: number): Action {
  if (!Number.isFinite(trueCount) || !Number.isFinite(index))
    throw new Error("Invalid count.");
  return Math.floor(trueCount) >= index ? "stand" : "hit";
}
export function hiLo(value: number): number {
  return value <= 6 ? 1 : value >= 10 ? -1 : 0;
}
export type SimulationMode = "basic-flat" | "basic-ramp" | "stand-flat";
export const simulationModes: SimulationMode[] = [
  "basic-flat",
  "basic-ramp",
  "stand-flat",
];
export const simulationNames: Record<SimulationMode, string> = {
  "basic-flat": "Basic strategy / flat 1 unit",
  "basic-ramp": "Basic strategy / configured ramp",
  "stand-flat": "Always stand / flat 1 unit",
};
export interface SimulationRequest {
  seed: number;
  blocks: number;
  ramp: number[];
}
export function validateSimulation(input: SimulationRequest) {
  if (
    !Number.isSafeInteger(input.seed) ||
    input.seed < 0 ||
    input.seed > 0xffffffff ||
    !Number.isInteger(input.blocks) ||
    input.blocks < 20 ||
    input.blocks > 200
  )
    throw new Error("Use a seed from 0 to 4294967295 and 20–200 blocks.");
  validateRamp(input.ramp);
}
export interface Estimate {
  mean: number;
  low: number;
  high: number;
  samples: number;
}
/** Independent 50-round blocks, not individual correlated shoe rounds, are the samples. */
export function estimate(samples: readonly number[]): Estimate {
  if (samples.length < 2 || samples.some((n) => !Number.isFinite(n)))
    throw new Error("Need finite samples.");
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance =
    samples.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (samples.length - 1);
  const margin = 1.96 * Math.sqrt(variance / samples.length);
  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    samples: samples.length,
  };
}
/** Fresh six-deck S17 blocks, 75% penetration, DAS, no surrender, 3:2, max 3 splits.
 * All cards (including unused hole cards) are exposed after settlement for counting.
 * No bankroll limits, insurance, deviations, or wonging. Profit is per initial round in base units.
 */
export function simulateBlock(
  mode: SimulationMode,
  seed: number,
  ramp: readonly number[],
): number {
  validateRamp(ramp);
  const random = seededRandom(seed);
  const game = new BlackjackGame(
    { decks: 6, dealer_hits_soft_17: false, allow_surrender: false },
    undefined,
    random,
  );
  const strategy = new Strategy();
  let running = 0,
    profit = 0;
  for (let round = 0; round < 50; round++) {
    if (game.shoe.length <= 78) {
      game.shoe = Shoe.shuffled(6, random);
      running = 0;
    }
    const before = game.shoe.snapshot();
    const bet =
      mode === "basic-ramp"
        ? betUnits(running / (before.length / 52), ramp)
        : 1;
    game.startRound(bet);
    while (game.round?.status === "player_turn") {
      const hand = game.activeHand!;
      const available = game.availableActions;
      game.apply(
        mode === "stand-flat"
          ? "stand"
          : strategy.decide(
              game.round.dealerCards[0].value,
              hand.cards.map((c) => c.value),
              {
                firstTurn: hand.firstTurn && !hand.splitHand,
                canDouble: available.includes("double"),
                canSplit: available.includes("split"),
              },
            ),
      );
    }
    if (game.round?.status !== "complete")
      throw new Error("Simulation did not settle.");
    profit += game.round.result.profit;
    running += before
      .slice(game.shoe.length)
      .reduce((sum, card) => sum + hiLo(card.value), 0);
  }
  return profit / 50;
}
export type SimulationMessage =
  | { type: "progress"; completed: number; total: number }
  | {
      type: "result";
      estimates: Record<SimulationMode, Estimate>;
      rounds: number;
    }
  | { type: "error"; message: string };
