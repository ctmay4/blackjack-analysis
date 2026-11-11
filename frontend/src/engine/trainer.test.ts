import { describe, expect, it } from "vitest";
import { Shoe, seededRandom } from "./cards";
import { TrainerSession } from "./trainer";
import { defaults, sessionConfig } from "./session-config";
import type { Config } from "./session-types";
import type { Action, Rules } from "./types";

function session(
  cards: number[],
  config: Partial<Omit<Config, "rules">> = {},
  rules: Partial<Rules> = {},
) {
  return new TrainerSession(
    { ...config, rules: { penetration: 0.99, ...rules } },
    { shoe: new Shoe(cards) },
  );
}

describe("teaching choices and scoring", () => {
  it("scores an incorrect legal choice and still plays it", () => {
    const trainer = session([7, 6, 10, 10]);
    const response = trainer.choose("stand");
    expect(response.correct).toBe(false);
    expect(response.recommendation?.action).toBe("hit");
    expect(response.message).toContain("Your choice was played");
    expect(trainer.snapshot()).toMatchObject({
      status: "complete",
      bankroll: 975,
      stats: { decisions: 1, correct: 0, losses: 1, current_streak: 0 },
    });
    expect(trainer.stats.mistakesByChoice.get("stand")).toBe(1);
    expect(trainer.stats.mistakesByRecommendation.get("hit")).toBe(1);
  });
  it("tracks accuracy, category, streaks, and best streak", () => {
    const trainer = session([10, 7, 2, 11, 10]);
    trainer.choose("hit");
    expect(trainer.stats.accuracy).toBe(1);
    expect(trainer.stats.accuracyFor("soft")).toBe(1);
    expect(trainer.stats.currentStreak).toBe(1);
    trainer.choose("stand");
    expect(trainer.stats.accuracy).toBe(0.5);
    expect(trainer.stats.currentStreak).toBe(0);
    expect(trainer.stats.bestStreak).toBe(1);
    expect(trainer.stats.accuracyFor("hard")).toBe(0);
  });
  it("does not score illegal choices or allow unknown actions", () => {
    const trainer = session([7, 6, 10, 10]);
    const before = trainer.snapshot();
    expect(trainer.choose("split").illegal).toBe(true);
    expect(trainer.snapshot().stats).toEqual(before.stats);
    expect(trainer.snapshot().hands).toEqual(before.hands);
    expect(() => trainer.choose("unknown" as Action)).toThrow("Unknown action");
  });
  it("correction scores the wrong attempt without moving cards, then accepts a retry", () => {
    const trainer = session([2, 7, 6, 10, 10], { feedback_mode: "correction" });
    const before = trainer.snapshot().hands;
    expect(trainer.choose("stand").message).toContain("Try again");
    expect(trainer.snapshot().hands).toEqual(before);
    expect(trainer.stats.decisions).toBe(1);
    trainer.choose("hit");
    expect(trainer.snapshot().hands[0].cards).toHaveLength(3);
    expect(trainer.stats.decisions).toBe(2);
    expect(trainer.stats.correctDecisions).toBe(1);
  });
  it("scores each split-hand choice and records settlement once", () => {
    const trainer = session([5, 2, 3, 10, 8, 8, 6]);
    expect(trainer.choose("split").correct).toBe(true);
    trainer.choose("stand");
    trainer.choose("stand");
    expect(trainer.stats.hands).toBe(2);
    expect(trainer.stats.rounds).toBe(1);
    const complete = trainer.snapshot();
    trainer.snapshot();
    trainer.snapshot();
    trainer.choose("hit");
    expect(trainer.stats.rounds).toBe(1);
    expect(trainer.bankroll).toBe(complete.bankroll);
  });
  it("does not count automatic naturals as decisions", () => {
    const trainer = session([7, 10, 11, 6]);
    expect(trainer.snapshot()).toMatchObject({
      status: "complete",
      feedback: "Blackjack!",
      bankroll: 1037.5,
      stats: { decisions: 0, wins: 1, rounds: 1 },
    });
    expect(trainer.stats.playerBlackjacks).toBe(1);
  });
});

describe("presentation privacy and isolation", () => {
  it("masks the hole card, dealer total, and recommendation until appropriate", () => {
    const trainer = session([7, 6, 10, 10]);
    expect(trainer.recommendation?.action).toBe("hit");
    const before = trainer.snapshot();
    expect(before.dealer_cards).toEqual([
      { rank: "10", suit: "", value: 10 },
      null,
    ]);
    expect(before.dealer_total).toBeNull();
    expect(before.feedback_detail.recommendation).toBeNull();
    expect(before.round_profit).toBeNull();
    trainer.choose("stand");
    expect(trainer.snapshot().dealer_total).toBe(17);
    expect(trainer.snapshot().dealer_cards[1]).not.toBeNull();
  });
  it("delayed mode withholds correctness, hints, mistakes, and current-round scoring", () => {
    const trainer = session([10, 7, 2, 11, 10], { feedback_mode: "delayed" });
    trainer.choose("hit");
    const hidden = trainer.snapshot();
    expect(hidden.feedback).toBe("Choice played. Feedback after the round.");
    expect(hidden.feedback_detail).toMatchObject({
      chosen: "hit",
      recommendation: null,
      correct: null,
    });
    expect(hidden.stats.decisions).toBe(0);
    expect(hidden.stats.missed_situations).toEqual([]);
    expect(hidden.dealer_cards[1]).toBeNull();
    expect(trainer.stats.openingMisses.size).toBe(0);
    trainer.choose("stand");
    expect(trainer.snapshot().feedback).toContain(
      "Round complete: 1/2 correct.",
    );
    expect(trainer.snapshot().stats.decisions).toBe(2);
  });
  it("keeps previous-round scores, but not new attempts, visible in delayed mode", () => {
    const trainer = session([10, 7, 2, 11, 10, 10, 7, 2, 11, 10], {
      feedback_mode: "delayed",
    });
    trainer.choose("hit");
    trainer.choose("stand");
    trainer.nextRound();
    trainer.choose("hit");
    expect(trainer.snapshot().stats.decisions).toBe(2);
    expect(trainer.snapshot().feedback_detail.correct).toBeNull();
    trainer.choose("stand");
    expect(trainer.stats.decisions).toBe(4);
  });
  it("returns detached snapshot/config/feedback data", () => {
    const trainer = session([7, 6, 10, 10]);
    const snapshot = trainer.snapshot();
    snapshot.config.rules.decks = 99;
    snapshot.hands[0].cards[0].rank = "2";
    snapshot.stats.breakdown[0].correct = 123;
    const config = trainer.config;
    config.bet = 999;
    expect(trainer.config.bet).toBe(25);
    expect(trainer.config.rules.decks).toBe(6);
    expect(trainer.snapshot().hands[0].cards[0].rank).toBe("10");
    expect(trainer.snapshot().stats.breakdown[0].correct).toBe(0);
    const result = trainer.choose("stand");
    result.message = "changed";
    expect(trainer.feedback.message).not.toBe("changed");
    expect(JSON.parse(JSON.stringify(trainer.snapshot()))).toEqual(
      trainer.snapshot(),
    );
  });
});

describe("practice filtering", () => {
  it("skips unmatched openings without recording hands or spending bankroll", () => {
    const cards = [10, 2, 11, 7, 10, 8, 8, 6];
    const soft = session(cards, { practice: "soft" });
    expect(soft.recommendation?.handKind).toBe("soft");
    expect(soft.game.shoe.length).toBe(0);
    expect(soft.stats.rounds).toBe(0);
    expect(soft.bankroll).toBe(1000);
    expect(session(cards, { practice: "pair" }).game.shoe.length).toBe(4);
    expect(
      session([10, 6, 10, 7, 10, 8, 8, 6], { practice: "hard" }).recommendation
        ?.handKind,
    ).toBe("hard");
  });
  it("discards unmatched natural blackjacks without changing bankroll or statistics", () => {
    const trainer = session([10, 2, 11, 7, 7, 10, 11, 6], { practice: "soft" });
    expect(trainer.recommendation?.handKind).toBe("soft");
    expect(trainer.bankroll).toBe(1000);
    expect(trainer.stats.playerBlackjacks).toBe(0);
    expect(trainer.stats.rounds).toBe(0);
  });
  it("targets surrender recommendations, not just legally available surrender", () => {
    const trainer = session(
      [7, 6, 10, 10],
      { practice: "surrender" },
      { allow_surrender: true },
    );
    expect(trainer.recommendation?.action).toBe("surrender");
    expect(() => session([7, 6, 10, 10], { practice: "surrender" })).toThrow(
      "requires",
    );
  });
  it("revisits opening mistakes, but not unreachable post-hit situations", () => {
    const openings = session([7, 6, 10, 10, 7, 6, 10, 10], {
      practice: "missed",
    });
    openings.choose("stand");
    openings.nextRound();
    expect(openings.recommendation).toMatchObject({
      handKind: "hard",
      playerTotal: 16,
      dealerCard: 10,
    });
    const later = session([7, 6, 10, 10, 10, 7, 2, 11, 10], {
      practice: "missed",
    });
    later.choose("hit");
    later.choose("stand");
    expect(later.stats.missedSituations.has("hard 13 vs 10")).toBe(true);
    expect(later.stats.openingMisses.size).toBe(0);
    later.nextRound();
    expect(later.recommendation?.playerTotal).toBe(16);
  });
  it("fails clearly for finite custom shoes without a match", () => {
    expect(() => session([7, 6, 10, 10], { practice: "pair" })).toThrow(
      "no matching",
    );
    expect(() => session([])).toThrow("no matching");
  });
  it("finds targeted openings in ordinary shuffled shoes and reshuffles at the cut card", () => {
    const trainer = new TrainerSession(
      { practice: "pair", rules: { penetration: 0.99 } },
      { random: seededRandom(123) },
    );
    expect(trainer.recommendation?.handKind).toBe("pair");
    trainer.choose("stand");
    trainer.nextRound();
    expect(trainer.recommendation?.handKind).toBe("pair");
    expect(trainer.stats.rounds).toBe(1);
    expect(trainer.bankroll).toBeLessThanOrEqual(1025);
  });
});

describe("failure atomicity and charts", () => {
  it("does not score or reveal feedback when an engine action fails", () => {
    for (const feedback_mode of [
      "immediate",
      "correction",
      "delayed",
    ] as const) {
      const trainer = session([2, 6, 10, 2], { feedback_mode });
      const before = trainer.snapshot();
      // Stand is correct against 2; exhausted dealer draws must roll it all back.
      expect(() => trainer.choose("stand")).toThrow("ran out");
      expect(trainer.snapshot()).toEqual(before);
      expect(trainer.stats.openingMisses.size).toBe(0);
    }
  });
  it("restores the previous completed hand after next-round filter failure", () => {
    const trainer = session([7, 6, 10, 10], { practice: "hard" });
    trainer.choose("stand");
    const before = trainer.snapshot();
    expect(() => trainer.nextRound()).toThrow("no matching");
    expect(trainer.snapshot()).toEqual(before);
    expect(trainer.stats.rounds).toBe(1);
  });
  it("restores discarded candidates too when the next-round filter exhausts its shoe", () => {
    const trainer = session([10, 8, 8, 6, 7, 6, 10, 10], { practice: "hard" });
    trainer.choose("stand");
    const before = trainer.snapshot(),
      shoe = trainer.game.shoe.values;
    expect(() => trainer.nextRound()).toThrow("no matching");
    expect(trainer.snapshot()).toEqual(before);
    expect(trainer.game.shoe.values).toEqual(shoe);
  });
  it("rejects advancing before completion", () => {
    const trainer = session([7, 6, 10, 10]);
    const before = trainer.snapshot();
    expect(() => trainer.nextRound()).toThrow("not complete");
    expect(trainer.snapshot()).toEqual(before);
  });
  it("builds a rule-based two-card chart with corrected initial ace splitting", () => {
    const trainer = session(
      [7, 6, 10, 10],
      {},
      { dealer_hits_soft_17: true, allow_surrender: true, resplit_aces: false },
    );
    const chart = trainer.strategyChart();
    expect(chart.map((section) => section.name)).toEqual([
      "Hard",
      "Soft",
      "Pairs",
    ]);
    expect(chart.map((section) => section.rows.length)).toEqual([16, 8, 10]);
    expect(chart[0].rows[11].actions[8]).toBe("surrender");
    expect(chart[2].rows[9].actions.every((action) => action === "split")).toBe(
      true,
    );
    const noSplits = session(
      [7, 6, 10, 10],
      {},
      { max_splits: 0 },
    ).strategyChart();
    expect(
      noSplits.flatMap((section) => section.rows.flatMap((row) => row.actions)),
    ).not.toContain("split");
  });
  it("teaches the corrected split-ace rules consistently with the opening chart", () => {
    const initial = session(
      [5, 8, 9, 10, 11, 11, 6],
      {},
      { resplit_aces: false },
    );
    expect(initial.recommendation?.action).toBe("split");
    expect(initial.choose("split").correct).toBe(true);
    expect(initial.stats.hands).toBe(2);
    const resplit = session([5, 4, 3, 2, 11, 10, 11, 11, 6], {
      feedback_mode: "delayed",
    });
    resplit.choose("split");
    expect(resplit.availableActions).toEqual(["split", "stand"]);
    expect(resplit.recommendation?.action).toBe("split");
    expect(resplit.snapshot().feedback_detail.correct).toBeNull();
    resplit.choose("split");
    expect(resplit.snapshot().feedback).toBe("Round complete: 2/2 correct.");
    expect(resplit.stats.hands).toBe(3);
  });
  it("charts are explicit references even in delayed mode and do not change scoring", () => {
    const trainer = session([10, 7, 2, 11, 10], { feedback_mode: "delayed" });
    trainer.choose("hit");
    const before = trainer.snapshot();
    trainer.strategyChart();
    expect(trainer.snapshot()).toEqual(before);
  });
});

describe("settings boundary", () => {
  it("uses detached six-deck web defaults and validates input at runtime", () => {
    expect(sessionConfig()).toEqual(defaults);
    const config = sessionConfig();
    config.rules.decks = 1;
    expect(sessionConfig().rules.decks).toBe(6);
    expect(
      sessionConfig({
        rules: { dealer_hits_soft_17: true },
        bankroll: 2500,
        bet: 50,
      }),
    ).toMatchObject({
      bankroll: 2500,
      bet: 50,
      rules: { dealer_hits_soft_17: true },
    });
  });
  it.each([
    null,
    [],
    { bet: 0 },
    { bet: "25" },
    { bankroll: Infinity },
    { bet: NaN },
    { bet: 1_000_001 },
    { practice: "unknown" },
    { practice: null },
    { feedback_mode: null },
    { practice: "pair", rules: { max_splits: 0 } },
    new Date(),
    { feedback_mode: "both" },
    { rules: null },
    { rules: { decks: 9 } },
    { rules: { max_splits: 4 } },
    { rules: { penetration: 1 } },
    { rules: { allow_surrender: "yes" } },
    { seed: 123 },
    { rules: { extra: true } },
    { practice: "surrender" },
  ])("rejects invalid config %j", (config) => {
    expect(() => sessionConfig(config)).toThrow();
  });
});
