import { z } from "zod";
import { evaluateHand, physicalCard } from "./cards";
import { sessionConfig } from "./session-config";
import type { Config } from "./session-types";
import { DEFAULT_RULES } from "./types";

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const action = z.enum(["hit", "stand", "double", "split", "surrender"]);
const kind = z.enum(["hard", "soft", "pair"]);
const card = z
  .strictObject({
    rank: z.enum([
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
    ]),
    suit: z.enum(["♠", "♥", "♦", "♣", ""]),
    value: z.number().int().min(2).max(11),
  })
  .refine(
    (value) => physicalCard(value.rank, value.suit).value === value.value,
    "Card rank/value mismatch",
  );
const cards = z.array(card).min(1).max(416);
const wager = z.number().positive().max(2_000_000);
const hand = z.strictObject({
  cards,
  bet: wager,
  splitHand: z.boolean(),
  firstTurn: z.boolean(),
  finished: z.boolean(),
  surrendered: z.boolean(),
  doubled: z.boolean(),
});
const resultHand = z.strictObject({
  cards,
  bet: wager,
  splitHand: z.boolean(),
  doubled: z.boolean(),
  outcome: z.enum(["win", "loss", "push", "surrender"]),
  profit: z.number(),
});
const base = {
  dealerCards: z.array(card).min(2).max(416),
  hands: z.array(hand).min(1).max(4),
  splitsUsed: z.number().int().min(0).max(3),
};
const round = z.discriminatedUnion("status", [
  z.strictObject({
    ...base,
    status: z.literal("player_turn"),
    activeHandIndex: z.number().int().min(0).max(3),
    result: z.null(),
  }),
  z.strictObject({
    ...base,
    status: z.literal("complete"),
    activeHandIndex: z.null(),
    result: z.strictObject({
      hands: z.array(resultHand).min(1).max(4),
      dealerCards: z.array(card).min(2).max(416),
      dealerBust: z.boolean(),
      dealerBlackjack: z.boolean(),
      profit: z.number(),
    }),
  }),
]);
const recommendation = z.strictObject({
  action,
  handKind: kind,
  playerTotal: z.number().int().min(1).max(100),
  dealerCard: z.number().int().min(2).max(11),
  explanation: z.string().max(2000),
});
const feedback = z.strictObject({
  message: z.string().max(20_000),
  chosen: action.nullable(),
  recommendation: recommendation.nullable(),
  correct: z.boolean().nullable(),
  illegal: z.boolean(),
});
const counters = z
  .array(z.tuple([z.string().min(1).max(100), count.min(1)]))
  .max(10_000)
  .refine(
    (entries) => new Set(entries.map(([key]) => key)).size === entries.length,
    "Duplicate counter keys",
  );
const categories = z.strictObject({ hard: count, soft: count, pair: count });
const stats = z.strictObject({
  decisions: count,
  correctDecisions: count,
  currentStreak: count,
  bestStreak: count,
  decisionsByKind: categories,
  correctByKind: categories,
  mistakesByChoice: counters,
  mistakesByRecommendation: counters,
  missedSituations: counters,
  openingMisses: counters,
  rounds: count,
  hands: count,
  wins: count,
  losses: count,
  pushes: count,
  surrenders: count,
  playerBlackjacks: count,
  dealerBlackjacks: count,
  playerBusts: count,
});
const checkpoint = z.strictObject({
  format: z.literal(1),
  config: z.unknown(),
  randomState: z.number().int().min(0).max(0xffffffff),
  customShoe: z.boolean(),
  shoe: z.array(card).max(416),
  round,
  stats,
  bankroll: z.number(),
  feedback,
  attempts: z
    .array(
      z.strictObject({
        action,
        recommendation,
        correct: z.boolean(),
        opening: z.boolean(),
      }),
    )
    .max(512),
  recorded: z.boolean(),
});
export { card as cardSchema, stats as statsSchema };
export type StatsCheckpoint = z.infer<typeof stats>;
export type TrainerCheckpoint = Omit<z.infer<typeof checkpoint>, "config"> & {
  config: Config;
};

/** Versioned internal state, NOT presentation data or an anti-cheating boundary. */
export function parseCheckpoint(input: unknown): TrainerCheckpoint {
  const saved = checkpoint.parse(input);
  const hasFields = (
    value: unknown,
    keys: string[],
  ): value is Record<string, unknown> =>
    !!value &&
    typeof value === "object" &&
    keys.every(
      (key) =>
        Object.hasOwn(value, key) &&
        (value as Record<string, unknown>)[key] !== undefined,
    );
  // Defaults are useful for new settings, never for a truncated saved game.
  if (
    !hasFields(saved.config, [
      "rules",
      "bankroll",
      "bet",
      "practice",
      "feedback_mode",
    ]) ||
    !hasFields(saved.config.rules, Object.keys(DEFAULT_RULES))
  )
    throw new Error("Invalid saved session: incomplete configuration");
  const config = sessionConfig(saved.config),
    state = saved.round,
    counts = saved.stats;
  const invalid = (condition: boolean, message: string) => {
    if (condition) throw new Error(`Invalid saved session: ${message}`);
  };
  invalid(
    state.hands.length !== state.splitsUsed + 1 ||
      state.splitsUsed > config.rules.max_splits,
    "split count",
  );
  invalid(
    state.hands.some((hand) => hand.splitHand !== state.splitsUsed > 0),
    "split flags",
  );
  invalid(saved.recorded !== (state.status === "complete"), "settlement flag");
  invalid(
    counts.correctDecisions > counts.decisions ||
      counts.currentStreak > counts.bestStreak ||
      counts.bestStreak > counts.correctDecisions,
    "decision totals",
  );
  invalid(
    counts.hands !==
      counts.wins + counts.losses + counts.pushes + counts.surrenders ||
      counts.rounds > counts.hands,
    "outcome totals",
  );
  invalid(
    counts.playerBlackjacks > counts.wins + counts.pushes ||
      counts.dealerBlackjacks > counts.rounds ||
      counts.playerBusts > counts.losses,
    "outcome counters",
  );
  invalid(
    Object.values(counts.decisionsByKind).reduce((a, b) => a + b, 0) !==
      counts.decisions ||
      Object.values(counts.correctByKind).reduce((a, b) => a + b, 0) !==
        counts.correctDecisions,
    "category totals",
  );
  for (const name of ["hard", "soft", "pair"] as const)
    invalid(
      counts.correctByKind[name] > counts.decisionsByKind[name],
      "category correctness",
    );
  const mistakes = counts.decisions - counts.correctDecisions;
  for (const entries of [
    counts.mistakesByChoice,
    counts.mistakesByRecommendation,
    counts.missedSituations,
  ])
    invalid(
      entries.reduce((sum, [, value]) => sum + value, 0) !== mistakes,
      "mistake totals",
    );
  invalid(
    counts.openingMisses.some(
      ([key, value]) =>
        value > (new Map(counts.missedSituations).get(key) ?? 0),
    ),
    "opening misses",
  );
  invalid(
    saved.attempts.some(
      (attempt) =>
        attempt.correct !== (attempt.action === attempt.recommendation.action),
    ),
    "pending correctness",
  );
  if (saved.feedback.correct !== null) {
    invalid(
      saved.feedback.chosen === null ||
        saved.feedback.recommendation === null ||
        saved.feedback.illegal ||
        saved.feedback.correct !==
          (saved.feedback.chosen === saved.feedback.recommendation?.action),
      "feedback correctness",
    );
  }
  const cardCount =
    saved.shoe.length +
    state.dealerCards.length +
    state.hands.reduce((sum, hand) => sum + hand.cards.length, 0);
  invalid(cardCount > config.rules.decks * 52, "too many cards");
  if (state.status === "player_turn") {
    const active = state.hands[state.activeHandIndex];
    invalid(
      !active ||
        active.finished ||
        active.cards.length < 2 ||
        evaluateHand(active.cards.map((card) => card.value)).total >= 21,
      "active hand",
    );
    invalid(
      state.hands
        .slice(0, state.activeHandIndex)
        .some((hand) => !hand.finished),
      "hand order",
    );
    if (config.feedback_mode === "delayed")
      invalid(
        saved.feedback.correct !== null ||
          saved.feedback.recommendation !== null,
        "delayed feedback",
      );
  } else {
    const result = state.result;
    invalid(
      counts.rounds === 0 ||
        state.hands.some((hand) => !hand.finished) ||
        result.hands.length !== state.hands.length,
      "completed hands",
    );
    invalid(
      JSON.stringify(result.dealerCards) !== JSON.stringify(state.dealerCards),
      "dealer result",
    );
    invalid(
      result.hands.reduce((sum, hand) => sum + hand.profit, 0) !==
        result.profit,
      "profit total",
    );
    for (const [index, hand] of state.hands.entries()) {
      const resolved = result.hands[index];
      invalid(
        !resolved ||
          resolved.bet !== hand.bet ||
          resolved.doubled !== hand.doubled ||
          resolved.splitHand !== hand.splitHand ||
          JSON.stringify(resolved.cards) !== JSON.stringify(hand.cards),
        "hand result",
      );
    }
  }
  return { ...saved, config };
}
