import { z } from "zod";
import { cardSchema, statsSchema } from "./engine/checkpoint";
import { sessionConfig } from "./engine/session-config";
import { TrainingStats } from "./engine/trainer";
import type { TrainerSession } from "./engine/trainer";
import type { Action, Recommendation } from "./engine/types";

export const REVIEW_ROUND_LIMIT = 200;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const action = z.enum(["hit", "stand", "double", "split", "surrender"]);
const decision = z
  .strictObject({
    hand: count.max(3),
    cards: z.array(cardSchema).min(2).max(416),
    dealer: cardSchema,
    chosen: action,
    recommended: action,
    explanation: z.string().max(2000),
    correct: z.boolean(),
    scored: z.boolean(),
  })
  .refine((value) => value.correct === (value.chosen === value.recommended));
const review = z
  .strictObject({
    number: count.min(1),
    complete: z.boolean(),
    dealer: z.array(cardSchema.nullable()).min(2).max(416),
    hands: z
      .array(
        z.strictObject({
          cards: z.array(cardSchema).min(1).max(416),
          bet: z.number().positive(),
          outcome: z.enum(["win", "loss", "push", "surrender"]).nullable(),
          profit: z.number().nullable(),
        }),
      )
      .min(1)
      .max(4),
    profit: z.number().nullable(),
    decisions: z.array(decision),
  })
  .refine((value) =>
    value.complete
      ? value.profit !== null &&
        value.dealer.every(Boolean) &&
        value.hands.every(
          (hand) => hand.outcome !== null && hand.profit !== null,
        ) &&
        value.decisions.every((item) => item.scored)
      : value.profit === null &&
        value.dealer.length === 2 &&
        value.dealer[0] !== null &&
        value.dealer[1] === null &&
        value.hands.every(
          (hand) => hand.outcome === null && hand.profit === null,
        ),
  );
const journal = z
  .strictObject({
    id: z.string().min(1).max(100),
    revision: count,
    startedAt: count.max(8640000000000000).nullable(),
    endedAt: count.max(8640000000000000).nullable(),
    reason: z.enum(["ended", "replaced"]).nullable(),
    partial: z.boolean(),
    config: z.unknown().transform((value) => sessionConfig(value)),
    bankroll: z.number(),
    stats: statsSchema.refine(
      (value) =>
        value.correctDecisions <= value.decisions &&
        value.currentStreak <= value.bestStreak &&
        value.bestStreak <= value.correctDecisions &&
        value.rounds <= value.hands &&
        value.hands <= value.rounds * 4 &&
        (["hard", "soft", "pair"] as const).every(
          (kind) => value.correctByKind[kind] <= value.decisionsByKind[kind],
        ) &&
        value.decisions ===
          Object.values(value.decisionsByKind).reduce((a, b) => a + b, 0) &&
        value.correctDecisions ===
          Object.values(value.correctByKind).reduce((a, b) => a + b, 0) &&
        value.hands ===
          value.wins + value.losses + value.pushes + value.surrenders,
    ),
    rounds: z.array(review).max(REVIEW_ROUND_LIMIT),
  })
  .refine((value) => {
    const scored = value.rounds
      .flatMap((round) => round.decisions)
      .filter((item) => item.scored);
    const correct = scored.filter((item) => item.correct).length;
    return (
      new Set(value.rounds.map((round) => round.number)).size ===
        value.rounds.length &&
      value.rounds.filter((round) => round.complete).length <=
        value.stats.rounds &&
      scored.length <= value.stats.decisions &&
      correct <= value.stats.correctDecisions &&
      scored.length - correct <=
        value.stats.decisions - value.stats.correctDecisions
    );
  });
const historySchema = z
  .strictObject({
    version: z.literal(1),
    active: journal.nullable(),
    sessions: z.array(journal),
  })
  .refine(
    (value) =>
      value.sessions.every(
        (session) => session.endedAt !== null && session.reason !== null,
      ) &&
      (!value.active ||
        (value.active.endedAt === null && value.active.reason === null)) &&
      new Set(value.sessions.map((session) => session.id)).size ===
        value.sessions.length &&
      !value.sessions.some((session) => session.id === value.active?.id),
  );
export type ReviewDecision = z.infer<typeof decision>;
export type RoundReview = z.infer<typeof review>;
export type SessionJournal = z.infer<typeof journal>;
export type HistoryRecord = z.infer<typeof historySchema>;
export class HistoryFailure extends Error {
  constructor(
    public code: "corrupt" | "unsupported",
    message: string,
  ) {
    super(message);
  }
}
export function emptyHistory(): HistoryRecord {
  return { version: 1, active: null, sessions: [] };
}
export function parseHistory(value: unknown): HistoryRecord {
  if (value === null) return emptyHistory();
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    value.version !== 1
  )
    throw new HistoryFailure(
      "unsupported",
      "Saved history uses an unsupported version. It has not been changed.",
    );
  try {
    return historySchema.parse(value);
  } catch {
    throw new HistoryFailure(
      "corrupt",
      "Saved history could not be read. It has not been changed. Delete saved history explicitly to recover; active practice will be kept.",
    );
  }
}
export function parseArchive(value: unknown): SessionJournal {
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    value.version !== 1
  )
    throw new HistoryFailure(
      "unsupported",
      "A saved session uses an unsupported history version. It has not been changed.",
    );
  try {
    return z
      .strictObject({ version: z.literal(1), session: journal })
      .parse(value).session;
  } catch {
    throw new HistoryFailure(
      "corrupt",
      "A saved session could not be read. History has not been changed. Delete saved history explicitly to recover.",
    );
  }
}
export function beginJournal(
  id: string,
  session: TrainerSession,
  now: number,
  partial = false,
  revision = 0,
): SessionJournal {
  return {
    id,
    revision,
    startedAt: partial ? null : now,
    endedAt: null,
    reason: null,
    partial,
    config: session.config,
    bankroll: session.bankroll,
    stats: session.stats.checkpoint(),
    rounds: [],
  };
}
export function activeJournal(
  history: HistoryRecord,
  id: string,
  session: TrainerSession,
  now: number,
  revision = 0,
): SessionJournal {
  if (history.active && history.active.id !== id)
    throw new HistoryFailure(
      "corrupt",
      "The saved history belongs to a different active session. It has not been changed. Delete saved history explicitly to recover.",
    );
  const journal =
    history.active ?? beginJournal(id, session, now, true, revision);
  // A still-open pre-history app can update the active save without a journal.
  if (journal.revision !== revision) journal.partial = true;
  journal.revision = revision;
  return journal;
}
export function captureDecision(
  session: TrainerSession,
  chosen: Action,
): ReviewDecision | null {
  if (!session.availableActions.includes(chosen)) return null;
  const recommendation: Recommendation | null = session.recommendation;
  if (!recommendation) return null;
  return {
    hand: session.round.activeHandIndex!,
    cards: structuredClone(session.game.activeHand!.cards),
    dealer: { ...session.round.dealerCards[0] },
    chosen,
    recommended: recommendation.action,
    explanation: recommendation.explanation,
    correct: chosen === recommendation.action,
    scored: session.config.feedback_mode !== "delayed",
  };
}
export function recordReview(
  journal: SessionJournal,
  session: TrainerSession,
  attempt?: ReviewDecision | null,
) {
  const snapshot = session.snapshot();
  let current = journal.rounds.find(
    (round) => round.number === snapshot.round_number,
  );
  if (!current) {
    current = {
      number: snapshot.round_number,
      complete: false,
      dealer: [],
      hands: [],
      profit: null,
      decisions: [],
    };
    journal.rounds.push(current);
  }
  if (attempt) current.decisions.push(attempt);
  current.complete = snapshot.status === "complete";
  current.dealer = snapshot.dealer_cards;
  current.hands = snapshot.hands.map(({ cards, bet, outcome, profit }) => ({
    cards,
    bet,
    outcome,
    profit,
  }));
  current.profit = snapshot.round_profit;
  if (current.complete)
    current.decisions.forEach((item) => {
      item.scored = true;
    });
  journal.rounds = journal.rounds.slice(-REVIEW_ROUND_LIMIT);
  journal.bankroll = snapshot.bankroll;
  journal.stats = session.stats.checkpoint();
}
export function archiveJournal(
  history: HistoryRecord,
  journal: SessionJournal,
  now: number,
  reason: "ended" | "replaced",
) {
  journal.endedAt = now;
  journal.reason = reason;
  history.active = null;
  return { id: journal.id, value: { version: 1 as const, session: journal } };
}
export function historySummary(sessions: SessionJournal[]) {
  const stats = new TrainingStats();
  let profit = 0;
  for (const session of sessions) {
    const saved = session.stats;
    for (const key of [
      "decisions",
      "correctDecisions",
      "rounds",
      "hands",
      "wins",
      "losses",
      "pushes",
      "surrenders",
    ] as const)
      stats[key] += saved[key];
    stats.bestStreak = Math.max(stats.bestStreak, saved.bestStreak);
    for (const kind of ["hard", "soft", "pair"] as const) {
      stats.decisionsByKind[kind] += saved.decisionsByKind[kind];
      stats.correctByKind[kind] += saved.correctByKind[kind];
    }
    for (const [situation, count] of saved.missedSituations)
      stats.missedSituations.set(
        situation,
        (stats.missedSituations.get(situation) ?? 0) + count,
      );
    profit += session.bankroll - session.config.bankroll;
  }
  return { stats: stats.snapshot(), profit };
}
export interface SessionHistory {
  sessions: SessionJournal[];
  totals: ReturnType<typeof historySummary>;
}
