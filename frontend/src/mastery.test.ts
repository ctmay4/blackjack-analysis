import { describe, expect, it } from "vitest";
import { TrainerSession } from "./engine/trainer";
import { seededRandom } from "./engine/cards";
import { defaults } from "./engine/session-config";
import {
  exerciseConfig,
  nextExercise,
  sessionMastery,
} from "./session-mastery";

const stats = new TrainerSession(defaults, {
  random: seededRandom(10),
}).snapshot().stats;

describe("session mastery", () => {
  it.each([
    [0, 0, false, 20],
    [19, 19, false, 1],
    [20, 18, true, 0],
    [20, 17, false, 0],
    [1000, 899, false, 0],
    [1000, 900, true, 0],
    [21, 18, false, 0],
  ])(
    "scores %i decisions and %i correct exactly",
    (decisions, correct, achieved, remaining) => {
      expect(
        sessionMastery({ ...stats, decisions, correct, accuracy: 1 }),
      ).toEqual({ achieved, remaining });
    },
  );

  it("suggests an optional cyclic learning path", () => {
    expect(
      ["hard", "soft", "pair", "missed", "all", "targeted", "surrender"].map(
        (mode) => nextExercise(mode as typeof defaults.practice).practice,
      ),
    ).toEqual(["soft", "pair", "missed", "all", "hard", "hard", "hard"]);
  });

  it("preserves training settings without leaking a chart target", () => {
    const config = {
      ...defaults,
      practice: "targeted" as const,
      target: { kind: "hard" as const, player: 16, dealer: 10 },
    };
    const next = exerciseConfig(config, "soft");
    expect(next).toEqual({ ...defaults, practice: "soft" });
    expect(config.target).toBeDefined();
    expect(next.rules).not.toBe(config.rules);
  });

  it("recomputes identical progress from a restored checkpoint", () => {
    const session = new TrainerSession(
      { ...defaults, practice: "hard" },
      { random: seededRandom(10) },
    );
    while (session.stats.decisions < 20) {
      if (session.snapshot().status === "complete") session.nextRound();
      else session.choose(session.recommendation!.action);
    }
    expect(sessionMastery(session.snapshot().stats).achieved).toBe(true);
    const restored = TrainerSession.restore(session.checkpoint());
    expect(sessionMastery(restored.snapshot().stats)).toEqual(
      sessionMastery(session.snapshot().stats),
    );
  });
});
