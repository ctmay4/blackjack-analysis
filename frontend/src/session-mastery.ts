import type { Config, SessionSnapshot } from "./engine/session-types";

export const masteryExercises = [
  { practice: "hard", name: "Hard hands" },
  { practice: "soft", name: "Soft hands" },
  { practice: "pair", name: "Pairs" },
  { practice: "missed", name: "Frequently missed" },
  { practice: "all", name: "Mixed practice" },
] as const;

/** A transparent session goal, not a claim of long-term or opening-cell mastery. */
export function sessionMastery(stats: SessionSnapshot["stats"]) {
  const remaining = Math.max(0, 20 - stats.decisions);
  // Use exact counters rather than the rounded accuracy shown elsewhere.
  const achieved = remaining === 0 && stats.correct * 10 >= stats.decisions * 9;
  return { remaining, achieved };
}

export function nextExercise(practice: Config["practice"]) {
  const index = masteryExercises.findIndex(
    (item) => item.practice === practice,
  );
  return masteryExercises[(index + 1) % masteryExercises.length];
}

export function exerciseConfig(
  config: Config,
  practice: (typeof masteryExercises)[number]["practice"],
): Config {
  const next = { ...structuredClone(config), practice };
  delete next.target;
  return next;
}
