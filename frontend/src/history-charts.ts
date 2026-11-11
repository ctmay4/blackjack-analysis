import type { SessionJournal } from "./session-history";

export interface ProgressPoint {
  session: number;
  endedAt: number | null;
  decisions: number;
  correct: number;
  accuracy: number | null;
  profit: number;
}

// Use whole-session counters, never the bounded review journal. Sorting a copy
// keeps the newest-first history list intact; ties retain the saved order.
export function historicalProgress(
  sessions: SessionJournal[],
): ProgressPoint[] {
  let decisions = 0;
  let correct = 0;
  let profit = 0;
  return sessions
    .slice()
    .reverse()
    .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))
    .map((item, index) => {
      decisions += item.stats.decisions;
      correct += item.stats.correctDecisions;
      profit += item.bankroll - item.config.bankroll;
      return {
        session: index + 1,
        endedAt: item.endedAt,
        decisions,
        correct,
        accuracy: decisions ? (correct / decisions) * 100 : null,
        profit,
      };
    });
}

export function chartCoordinates(values: (number | null)[], percent = false) {
  const numbers = values.filter((value): value is number => value !== null);
  const min = percent ? 0 : numbers.reduce((a, b) => Math.min(a, b), 0);
  const max = percent ? 100 : numbers.reduce((a, b) => Math.max(a, b), 0);
  const span = max - min || 1;
  return {
    min,
    max,
    zero: 150 - ((0 - min) / span) * 130,
    points: values.map((value, index) =>
      value === null
        ? null
        : {
            x:
              values.length === 1
                ? 300
                : 40 + (index / (values.length - 1)) * 520,
            y: 150 - ((value - min) / span) * 130,
          },
    ),
  };
}
