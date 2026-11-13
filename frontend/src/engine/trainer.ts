import { evaluateHand, seededRandom, Shoe } from "./cards";
import type { RandomSource, StatefulRandom } from "./cards";
import { parseCheckpoint } from "./checkpoint";
import type { StatsCheckpoint, TrainerCheckpoint } from "./checkpoint";
import { BlackjackGame, handValue, isBlackjack } from "./game";
import { sessionConfig } from "./session-config";
import { Strategy } from "./strategy";
import type { Action, Recommendation } from "./types";
import type {
  ChartSection,
  Config,
  Feedback,
  SessionSnapshot,
} from "./session-types";

type HandKind = Recommendation["handKind"];
const kinds: HandKind[] = ["hard", "soft", "pair"];
const actions: readonly Action[] = [
  "hit",
  "stand",
  "double",
  "split",
  "surrender",
];
const title = (value: string) => value[0].toUpperCase() + value.slice(1);
const increment = (counts: Map<string, number>, key: string) =>
  counts.set(key, (counts.get(key) ?? 0) + 1);
function feedback(
  message: string,
  chosen: Action | null = null,
  recommendation: Recommendation | null = null,
  correct: boolean | null = null,
  illegal = false,
): Feedback {
  return { message, chosen, recommendation, correct, illegal };
}

export class TrainingStats {
  decisions = 0;
  correctDecisions = 0;
  currentStreak = 0;
  bestStreak = 0;
  decisionsByKind: Record<HandKind, number> = { hard: 0, soft: 0, pair: 0 };
  correctByKind: Record<HandKind, number> = { hard: 0, soft: 0, pair: 0 };
  mistakesByChoice = new Map<string, number>();
  mistakesByRecommendation = new Map<string, number>();
  missedSituations = new Map<string, number>();
  openingMisses = new Map<string, number>();
  rounds = 0;
  hands = 0;
  wins = 0;
  losses = 0;
  pushes = 0;
  surrenders = 0;
  playerBlackjacks = 0;
  dealerBlackjacks = 0;
  playerBusts = 0;
  get accuracy() {
    return this.decisions ? this.correctDecisions / this.decisions : 0;
  }
  accuracyFor(kind: HandKind) {
    return this.decisionsByKind[kind]
      ? this.correctByKind[kind] / this.decisionsByKind[kind]
      : 0;
  }
  checkpoint(): StatsCheckpoint {
    return {
      decisions: this.decisions,
      correctDecisions: this.correctDecisions,
      currentStreak: this.currentStreak,
      bestStreak: this.bestStreak,
      decisionsByKind: { ...this.decisionsByKind },
      correctByKind: { ...this.correctByKind },
      mistakesByChoice: [...this.mistakesByChoice],
      mistakesByRecommendation: [...this.mistakesByRecommendation],
      missedSituations: [...this.missedSituations],
      openingMisses: [...this.openingMisses],
      rounds: this.rounds,
      hands: this.hands,
      wins: this.wins,
      losses: this.losses,
      pushes: this.pushes,
      surrenders: this.surrenders,
      playerBlackjacks: this.playerBlackjacks,
      dealerBlackjacks: this.dealerBlackjacks,
      playerBusts: this.playerBusts,
    };
  }
  restore(saved: StatsCheckpoint) {
    const {
      mistakesByChoice,
      mistakesByRecommendation,
      missedSituations,
      openingMisses,
      ...counts
    } = saved;
    Object.assign(this, counts, {
      mistakesByChoice: new Map(mistakesByChoice),
      mistakesByRecommendation: new Map(mistakesByRecommendation),
      missedSituations: new Map(missedSituations),
      openingMisses: new Map(openingMisses),
    });
  }
  snapshot(): SessionSnapshot["stats"] {
    return {
      decisions: this.decisions,
      correct: this.correctDecisions,
      accuracy: this.accuracy,
      current_streak: this.currentStreak,
      best_streak: this.bestStreak,
      breakdown: kinds.map((kind) => ({
        kind,
        decisions: this.decisionsByKind[kind],
        correct: this.correctByKind[kind],
        accuracy: this.accuracyFor(kind),
      })),
      // Stable sorting preserves first-seen order on ties, like Counter.most_common.
      missed_situations: [...this.missedSituations]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([situation, count]) => ({ situation, count })),
      hands: this.hands,
      rounds: this.rounds,
      wins: this.wins,
      losses: this.losses,
      pushes: this.pushes,
      surrenders: this.surrenders,
    };
  }
}

interface Attempt {
  action: Action;
  recommendation: Recommendation;
  correct: boolean;
  opening: boolean;
}
export interface TrainerOptions {
  shoe?: Shoe;
  random?: RandomSource;
  /** Archived opening mistakes; kept separate from this session's scores. */
  drillSituations?: string[];
  /** Prefer TrainerSession.restore() for this versioned hydration path. */
  checkpoint?: unknown;
}

/** Teaching rules only. Presentation receives detached, masked snapshots. */
export class TrainerSession {
  readonly game: BlackjackGame;
  readonly strategy: Strategy;
  readonly stats = new TrainingStats();
  bankroll: number;
  feedback: Feedback = feedback("Choose the best basic-strategy action.");
  private readonly configValue: Config;
  private readonly random: RandomSource;
  private readonly customShoe: boolean;
  private attempts: Attempt[] = [];
  private recorded = false;
  private readonly drillSituations: Set<string>;

  constructor(config: unknown = {}, options: TrainerOptions = {}) {
    const saved = Object.hasOwn(options, "checkpoint")
      ? parseCheckpoint(options.checkpoint)
      : null;
    this.configValue = saved ? saved.config : sessionConfig(config);
    this.random = saved
      ? seededRandom(saved.randomState)
      : (options.random ??
        seededRandom(Math.floor(Math.random() * 0x100000000)));
    this.customShoe = saved ? saved.customShoe : options.shoe !== undefined;
    this.game = new BlackjackGame(
      this.configValue.rules,
      saved ? new Shoe(saved.shoe) : options.shoe,
      this.random,
    );
    this.strategy = new Strategy(
      this.configValue.rules.dealer_hits_soft_17
        ? "hit_soft_17"
        : "stand_soft_17",
      {
        allowSurrender: this.configValue.rules.allow_surrender,
        doubleAfterSplit: this.configValue.rules.double_after_split,
      },
    );
    // Rule changes can make archived categories unreachable (e.g. no splitting).
    const archived = saved?.drillSituations ?? options.drillSituations ?? [];
    const reachable = new Set<string>();
    for (let dealer = 2; archived.length && dealer <= 11; dealer++)
      for (let first = 2; first <= 11; first++)
        for (let second = 2; second <= 11; second++) {
          if (evaluateHand([first, second]).total >= 21) continue;
          reachable.add(
            this.situation(
              this.strategy.recommend(dealer, [first, second], {
                firstTurn: true,
                canDouble: true,
                canSplit:
                  first === second && this.configValue.rules.max_splits > 0,
              }),
            ),
          );
        }
    this.drillSituations = new Set(
      archived.filter((key) => reachable.has(key)),
    );
    this.bankroll = saved ? saved.bankroll : this.configValue.bankroll;
    if (saved) {
      this.game.round = saved.round;
      this.stats.restore(saved.stats);
      this.feedback = saved.feedback;
      this.attempts = saved.attempts;
      this.recorded = saved.recorded;
    } else this.startRound();
  }
  static restore(input: unknown): TrainerSession {
    return new TrainerSession({}, { checkpoint: input });
  }
  checkpoint(): TrainerCheckpoint {
    const random = this.random as Partial<StatefulRandom>;
    if (typeof random.getState !== "function")
      throw new Error("This random source cannot be saved");
    return parseCheckpoint({
      format: 1,
      config: this.config,
      randomState: random.getState(),
      customShoe: this.customShoe,
      ...(this.drillSituations.size
        ? { drillSituations: [...this.drillSituations] }
        : {}),
      shoe: this.game.shoe.snapshot(),
      round: structuredClone(this.round),
      stats: this.stats.checkpoint(),
      bankroll: this.bankroll,
      feedback: structuredClone(this.feedback),
      attempts: structuredClone(this.attempts),
      recorded: this.recorded,
    });
  }
  get config(): Config {
    return structuredClone(this.configValue);
  }
  get round() {
    return this.game.round!;
  }
  get availableActions(): Action[] {
    return this.game.availableActions;
  }
  /** Internal teaching hint. Never serialize this getter before a choice. */
  get recommendation(): Recommendation | null {
    const hand = this.game.activeHand;
    if (!hand) return null;
    const available = this.availableActions;
    return this.strategy.recommend(
      this.round.dealerCards[0].value,
      hand.cards.map((card) => card.value),
      {
        firstTurn: hand.firstTurn && !hand.splitHand,
        canDouble: available.includes("double"),
        canSplit: available.includes("split"),
      },
    );
  }
  choose(action: Action): Feedback {
    if (!actions.includes(action)) throw new Error("Unknown action");
    if (this.round.status === "complete") {
      this.feedback = feedback(
        "The round is complete. Start the next round.",
        null,
        null,
        null,
        true,
      );
      return structuredClone(this.feedback);
    }
    if (!this.availableActions.includes(action)) {
      this.feedback = feedback(
        `${title(action)} is not available for this hand.`,
        action,
        null,
        null,
        true,
      );
      return structuredClone(this.feedback);
    }
    const recommendation = this.recommendation!;
    const correct = action === recommendation.action;
    const hand = this.game.activeHand!;
    const opening =
      hand.firstTurn && !hand.splitHand && hand.cards.length === 2;
    const attempt = { action, recommendation, correct, opening };
    if (this.configValue.feedback_mode === "correction" && !correct) {
      this.score(attempt);
      this.feedback = feedback(
        `Try again — ${recommendation.explanation}`,
        action,
        recommendation,
        false,
      );
      return structuredClone(this.feedback);
    }
    // Apply first: failed draws must not score a choice or expose partial feedback.
    this.game.apply(action);
    this.attempts.push(attempt);
    if (this.configValue.feedback_mode === "delayed") {
      this.feedback = feedback(
        "Choice played. Feedback after the round.",
        action,
      );
      if (this.game.round?.status === "complete") {
        for (const item of this.attempts) this.score(item);
        const mistakes = this.attempts
          .filter((item) => !item.correct)
          .map((item) => item.recommendation.explanation);
        const summary = `Round complete: ${this.attempts.length - mistakes.length}/${this.attempts.length} correct.`;
        this.feedback = feedback(
          summary + (mistakes.length ? " " + mistakes.join(" ") : ""),
        );
      }
    } else {
      this.score(attempt);
      this.feedback = feedback(
        correct
          ? `Correct — ${title(action)}.`
          : `You chose ${action}; ${recommendation.explanation} Your choice was played.`,
        action,
        recommendation,
        correct,
      );
    }
    this.recordCompletedRound();
    return structuredClone(this.feedback);
  }
  nextRound() {
    if (this.round.status !== "complete")
      throw new Error("the current round is not complete");
    this.startRound();
    return this.snapshot();
  }
  private score(attempt: Attempt) {
    const { action, recommendation, correct, opening } = attempt;
    this.stats.decisions++;
    this.stats.decisionsByKind[recommendation.handKind]++;
    if (correct) {
      this.stats.correctDecisions++;
      this.stats.correctByKind[recommendation.handKind]++;
      this.stats.currentStreak++;
      this.stats.bestStreak = Math.max(
        this.stats.bestStreak,
        this.stats.currentStreak,
      );
    } else {
      this.stats.currentStreak = 0;
      increment(this.stats.mistakesByChoice, action);
      increment(this.stats.mistakesByRecommendation, recommendation.action);
      increment(this.stats.missedSituations, this.situation(recommendation));
      if (opening)
        increment(this.stats.openingMisses, this.situation(recommendation));
    }
  }
  private situation(recommendation: Recommendation) {
    return `${recommendation.handKind} ${recommendation.playerTotal} vs ${recommendation.dealerCard === 11 ? "A" : recommendation.dealerCard}`;
  }
  private matchesPractice(): boolean {
    const practice = this.configValue.practice;
    if (
      practice === "all" ||
      (practice === "missed" &&
        this.stats.openingMisses.size === 0 &&
        this.drillSituations.size === 0)
    )
      return true;
    const recommendation = this.recommendation;
    if (!recommendation) return false;
    if (practice === "missed")
      return (
        this.stats.openingMisses.has(this.situation(recommendation)) ||
        this.drillSituations.has(this.situation(recommendation))
      );
    if (practice === "surrender") return recommendation.action === "surrender";
    return recommendation.handKind === practice;
  }
  private startRound() {
    const before = structuredClone(this.game.round),
      shoe = this.game.shoe.clone();
    const random = this.random as Partial<StatefulRandom>;
    const randomState = random.getState?.();
    try {
      let matched = false;
      for (let attempt = 0; attempt < 10_000; attempt++) {
        const cutCard =
          this.configValue.rules.decks *
          52 *
          this.configValue.rules.penetration;
        if (!this.customShoe && this.game.shoe.length <= cutCard)
          this.game.shoe = Shoe.shuffled(
            this.configValue.rules.decks,
            this.random,
          );
        if (this.customShoe && this.game.shoe.length < 4)
          throw new Error("no matching opening hand remains in the test shoe");
        this.game.startRound(this.configValue.bet);
        if (this.matchesPractice()) {
          matched = true;
          break;
        }
        // Explicitly discard the candidate; never invent a settlement or score it.
        this.game.round = null;
      }
      if (!matched)
        throw new Error("could not find a hand matching the practice filter");
    } catch (error) {
      this.game.round = before;
      this.game.shoe = shoe;
      if (randomState !== undefined) random.setState?.(randomState);
      throw error;
    }
    this.recorded = false;
    this.attempts = [];
    if (this.round.status === "complete") {
      const playerBlackjack = this.round.hands.some(isBlackjack);
      this.feedback = feedback(
        this.round.result.dealerBlackjack
          ? playerBlackjack
            ? "Both player and dealer have blackjack — push."
            : "Dealer blackjack."
          : "Blackjack!",
      );
    } else this.feedback = feedback("Choose the best basic-strategy action.");
    this.recordCompletedRound();
  }
  private recordCompletedRound() {
    if (this.round.status !== "complete" || this.recorded) return;
    this.recorded = true;
    const result = this.round.result;
    this.stats.rounds++;
    this.stats.hands += result.hands.length;
    this.stats.dealerBlackjacks += Number(result.dealerBlackjack);
    this.bankroll += result.profit;
    for (const hand of result.hands) {
      if (hand.outcome === "win") this.stats.wins++;
      else if (hand.outcome === "loss") this.stats.losses++;
      else if (hand.outcome === "push") this.stats.pushes++;
      else this.stats.surrenders++;
      const value = evaluateHand(hand.cards.map((card) => card.value));
      this.stats.playerBusts += Number(value.bust);
      this.stats.playerBlackjacks += Number(value.blackjack && !hand.splitHand);
    }
  }
  strategyChart(): ChartSection[] {
    const hard = Array.from({ length: 16 }, (_, index) => {
      const total = index + 5;
      return {
        label: String(total),
        cards: total < 12 ? [2, total - 2] : [10, total - 10],
      };
    });
    const soft = Array.from({ length: 8 }, (_, index) => ({
      label: `A,${index + 2}`,
      cards: [11, index + 2],
    }));
    const pairs = Array.from({ length: 10 }, (_, index) => ({
      label: index === 9 ? "A,A" : `${index + 2},${index + 2}`,
      cards: [index + 2, index + 2],
    }));
    return [
      { name: "Hard", rows: hard },
      { name: "Soft", rows: soft },
      { name: "Pairs", rows: pairs },
    ].map((section) => ({
      name: section.name,
      rows: section.rows.map((row) => ({
        label: row.label,
        actions: Array.from({ length: 10 }, (_, index) =>
          this.strategy.decide(index + 2, row.cards, {
            // Opening chart: no-resplit-aces does not forbid the initial A/A split.
            canSplit:
              section.name === "Pairs" && this.configValue.rules.max_splits > 0,
          }),
        ),
      })),
    }));
  }
  snapshot(): SessionSnapshot {
    const state = this.round,
      complete = state.status === "complete";
    return {
      status: state.status,
      round_number: this.stats.rounds + Number(!complete),
      round_profit: state.result?.profit ?? null,
      dealer_total: complete
        ? evaluateHand(state.dealerCards.map((card) => card.value)).total
        : null,
      config: this.config,
      dealer_cards: state.dealerCards.map((card, index) =>
        index === 0 || complete ? { ...card } : null,
      ),
      hands: state.hands.map((hand, index) => ({
        cards: hand.cards.map((card) => ({ ...card })),
        total: handValue(hand).total,
        soft: handValue(hand).soft,
        active: index === state.activeHandIndex,
        bet: hand.bet,
        finished: hand.finished,
        outcome: state.result?.hands[index].outcome ?? null,
        profit: state.result?.hands[index].profit ?? null,
      })),
      available_actions: this.availableActions,
      feedback: this.feedback.message,
      feedback_detail: {
        correct: this.feedback.correct,
        illegal: this.feedback.illegal,
        chosen: this.feedback.chosen,
        recommendation: this.feedback.recommendation?.action ?? null,
      },
      bankroll: this.bankroll,
      stats: this.stats.snapshot(),
    };
  }
}
