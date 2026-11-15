import { describe, expect, it } from "vitest";
import { chartTarget, targetCards, targetLabel } from "./practice-target";
import { sessionConfig } from "./session-config";
import { TrainerSession } from "./trainer";
import { seededRandom, Shoe } from "./cards";
import type { Action } from "./types";

const target = { kind: "hard", player: 16, dealer: 10 } as const;

function finish(session: TrainerSession) {
  for (let i = 0; session.round.status !== "complete" && i < 40; i++)
    session.choose(session.recommendation!.action as Action);
  expect(session.round.status).toBe("complete");
}

function expectTarget(session: TrainerSession) {
  const target = session.config.target!;
  expect(session.snapshot().dealer_cards[0]!.value).toBe(target.dealer);
  expect(
    session.round.hands[0].cards
      .map((card) => card.value)
      .sort((a, b) => a - b),
  ).toEqual(targetCards(target).sort((a, b) => a - b));
  expect(session.snapshot().dealer_cards[1]).toBeNull();
  expect(session.round.status).toBe("player_turn");
}

describe("chart drill targets", () => {
  it("requires a strict, bounded target only in targeted mode", () => {
    for (const bad of [
      undefined,
      null,
      [],
      {},
      { ...target, extra: true },
      { ...target, kind: "other" },
      { ...target, player: "16" },
      { ...target, player: 4 },
      { ...target, player: 21 },
      { ...target, dealer: 1 },
      { ...target, dealer: 12 },
      { ...target, dealer: 2.5 },
      { kind: "soft", player: 10, dealer: 2 },
      { kind: "pair", player: 12, dealer: 2 },
    ]) {
      expect(() =>
        sessionConfig({ practice: "targeted", target: bad }),
      ).toThrow();
    }
    expect(() => sessionConfig({ target })).toThrow();
    expect(sessionConfig({ practice: "targeted", target }).target).toEqual(
      target,
    );
    expect(sessionConfig()).not.toHaveProperty("target");
    expect(targetLabel(target)).toBe("Hard 16 (10, 6) vs 10");
    expect(targetLabel(chartTarget("Pairs", "A,A", 11))).toBe(
      "Pair (A, A) vs A",
    );
    expect(targetLabel(chartTarget("Soft", "A,7", 2))).toBe(
      "Soft 18 (A, 7) vs 2",
    );
  });

  it("can deal every chart cell, including hard 20 and ace pairs", () => {
    const chart = new TrainerSession(
      {},
      { random: seededRandom(1) },
    ).strategyChart();
    let seed = 2;
    for (const section of chart)
      for (const row of section.rows)
        for (let dealer = 2; dealer <= 11; dealer++) {
          const target = chartTarget(section.name, row.label, dealer);
          const session = new TrainerSession(
            { practice: "targeted", target },
            { random: seededRandom(seed++) },
          );
          expectTarget(session);
          expect(session.recommendation!.action).toBe(row.actions[dealer - 2]);
          expect(session.stats.decisions).toBe(0);
          expect(session.stats.rounds).toBe(0);
        }
  }, 60000);

  it.each(["immediate", "correction", "delayed"])(
    "repeats, scores, and restores future play with %s feedback",
    (feedback_mode) => {
      const session = new TrainerSession(
        { practice: "targeted", target, feedback_mode },
        { random: seededRandom(42) },
      );
      for (let i = 0; i < 6; i++) {
        expectTarget(session);
        const saved = session.checkpoint();
        const restored = TrainerSession.restore(saved);
        expect(restored.checkpoint()).toEqual(saved);
        finish(session);
        finish(restored);
        expect(restored.checkpoint()).toEqual(session.checkpoint());
        session.nextRound();
        restored.nextRound();
        expect(restored.checkpoint()).toEqual(session.checkpoint());
      }
      expect(session.stats.decisions).toBeGreaterThanOrEqual(6);
      expect(session.stats.rounds).toBe(6);
      const invalid = structuredClone(session.checkpoint());
      delete invalid.config.target;
      expect(() => TrainerSession.restore(invalid)).toThrow();
    },
  );

  it("preserves pair targets when splitting is disabled", () => {
    const session = new TrainerSession(
      {
        practice: "targeted",
        target: { kind: "pair", player: 11, dealer: 6 },
        rules: { max_splits: 0 },
      },
      { random: seededRandom(20) },
    );
    expectTarget(session);
    expect(session.availableActions).not.toContain("split");
    finish(session);
    session.nextRound();
    expectTarget(session);
  });

  it("restores a pending delayed decision without exposing or scoring it twice", () => {
    const session = new TrainerSession(
      {
        practice: "targeted",
        target: { kind: "soft", player: 2, dealer: 2 },
        feedback_mode: "delayed",
      },
      { random: seededRandom(17) },
    );
    session.choose("hit");
    expect(session.round.status).toBe("player_turn");
    expect(session.stats.decisions).toBe(0);
    expect(session.snapshot().feedback_detail.recommendation).toBeNull();
    const restored = TrainerSession.restore(session.checkpoint());
    expect(restored.snapshot()).toEqual(session.snapshot());
    finish(session);
    finish(restored);
    expect(restored.checkpoint()).toEqual(session.checkpoint());
    expect(restored.stats.decisions).toBeGreaterThanOrEqual(2);
  });

  it("fails without silently substituting a different target", () => {
    expect(
      () =>
        new TrainerSession(
          { practice: "targeted", target },
          { shoe: new Shoe([10, 7, 2, 11]) },
        ),
    ).toThrow("no matching opening hand");
  });
});
