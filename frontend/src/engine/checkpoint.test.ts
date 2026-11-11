import { expect, it } from "vitest";
import { TrainerSession } from "./trainer";
import { seededRandom, Shoe } from "./cards";

it.each(["immediate", "correction", "delayed"] as const)(
  "restores %s sessions including future shuffles and filters",
  (feedback_mode) => {
    let control = new TrainerSession(
      {
        feedback_mode,
        practice: "pair",
        rules: { decks: 1, penetration: 0.8 },
      },
      { random: seededRandom(123) },
    );
    let restored = TrainerSession.restore(
      JSON.parse(JSON.stringify(control.checkpoint())),
    );
    for (let step = 0; step < 150; step++) {
      expect(restored.snapshot()).toEqual(control.snapshot());
      expect(restored.checkpoint().randomState).toBe(
        control.checkpoint().randomState,
      );
      if (control.round.status === "complete") {
        control.nextRound();
        restored.nextRound();
      } else {
        const choice =
          step % 3 === 0 ? "stand" : control.recommendation!.action;
        control.choose(choice);
        restored.choose(choice);
      }
      restored = TrainerSession.restore(
        JSON.parse(JSON.stringify(restored.checkpoint())),
      );
    }
    expect(restored.snapshot()).toEqual(control.snapshot());
    expect(control.stats.rounds).toBeGreaterThan(20);
  },
);

it("preserves pending delayed split decisions without exposing them", () => {
  const original = new TrainerSession(
    { feedback_mode: "delayed" },
    { shoe: new Shoe([5, 2, 3, 10, 8, 8, 6]) },
  );
  original.choose("split");
  const restored = TrainerSession.restore(original.checkpoint());
  expect(restored.snapshot().stats.decisions).toBe(0);
  expect(restored.snapshot().feedback_detail.recommendation).toBeNull();
  expect(restored.snapshot().dealer_cards[1]).toBeNull();
  restored.choose("stand");
  restored.choose("stand");
  expect(restored.stats.decisions).toBe(3);
  expect(restored.snapshot().feedback).toContain("Round complete");
});

it("does not double-settle a completed restored round", () => {
  let session = new TrainerSession({}, { shoe: new Shoe([7, 6, 10, 10]) });
  session.choose("stand");
  const before = session.snapshot();
  for (let index = 0; index < 5; index++)
    session = TrainerSession.restore(session.checkpoint());
  expect(session.snapshot()).toEqual(before);
  session.choose("hit");
  expect(session.bankroll).toBe(before.bankroll);
  expect(session.stats.rounds).toBe(1);
});

it("rejects invalid checkpoints rather than trusting browser data", () => {
  const session = new TrainerSession({}, { random: seededRandom(10) });
  const saved = session.checkpoint();
  for (const mutate of [
    (value: typeof saved) => {
      value.format = 99 as 1;
    },
    (value: typeof saved) => {
      value.randomState = -1;
    },
    (value: typeof saved) => {
      value.stats.correctDecisions = 100;
    },
    (value: typeof saved) => {
      value.recorded = true;
    },
    (value: typeof saved) => {
      value.round.hands[0].cards[0].value = 99;
    },
    (value: typeof saved) => {
      value.round.hands[0].bet = Infinity;
    },
    (value: typeof saved) => {
      value.shoe = new Array(417).fill(value.shoe[0]);
    },
  ]) {
    const value = structuredClone(saved);
    mutate(value);
    expect(() => TrainerSession.restore(value)).toThrow();
  }
  expect(() => TrainerSession.restore(null)).toThrow();
  expect(() => TrainerSession.restore(undefined)).toThrow();
  expect(() => TrainerSession.restore({ ...saved, config: {} })).toThrow(
    "incomplete configuration",
  );
  expect(() =>
    TrainerSession.restore({
      ...saved,
      config: { ...saved.config, rules: { decks: 6 } },
    }),
  ).toThrow("incomplete configuration");
  expect(() => TrainerSession.restore({ ...saved, extra: true })).toThrow();
  expect(session.snapshot().stats.decisions).toBe(0);
});

it("rejects serializing arbitrary non-checkpointable random functions", () => {
  const session = new TrainerSession(
    {},
    { shoe: new Shoe([7, 6, 10, 10]), random: () => 0.5 },
  );
  expect(() => session.checkpoint()).toThrow("cannot be saved");
});
