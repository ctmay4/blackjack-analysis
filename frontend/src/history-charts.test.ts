import { expect, it } from "vitest";
import { historicalProgress, chartCoordinates } from "./history-charts";
import { beginJournal } from "./session-history";
import { TrainerSession } from "./engine/trainer";

function session(
  endedAt: number,
  correct: number,
  decisions: number,
  profit: number,
) {
  const journal = beginJournal(
    String(endedAt),
    new TrainerSession({}),
    endedAt - 1,
  );
  journal.endedAt = endedAt;
  journal.stats.correctDecisions = correct;
  journal.stats.decisions = decisions;
  journal.bankroll = journal.config.bankroll + profit;
  return journal;
}

it("uses chronological, decision-weighted whole-session totals without changing saved order", () => {
  const older = session(10, 1, 1, -10);
  const newer = session(20, 1, 3, 25);
  older.partial = true;
  // No retained rounds: counters still represent the whole session.
  const input = [newer, older];
  expect(historicalProgress(input)).toEqual([
    {
      session: 1,
      endedAt: 10,
      decisions: 1,
      correct: 1,
      accuracy: 100,
      profit: -10,
    },
    {
      session: 2,
      endedAt: 20,
      decisions: 4,
      correct: 2,
      accuracy: 50,
      profit: 15,
    },
  ]);
  expect(input).toEqual([newer, older]);
});

it("does not invent accuracy for sessions without scored decisions", () => {
  expect(historicalProgress([])).toEqual([]);
  const points = historicalProgress([
    session(20, 0, 0, 0),
    session(10, 0, 0, 0),
  ]);
  expect(points.map((point) => point.accuracy)).toEqual([null, null]);
  expect(points.map((point) => point.profit)).toEqual([0, 0]);
});

it("scales positive, negative, constant and single-point charts with a zero baseline", () => {
  for (const values of [[0], [10], [-10], [-20, 10], [5, 5], [null, 50], []]) {
    const chart = chartCoordinates(values);
    expect(Number.isFinite(chart.zero)).toBe(true);
    for (const point of chart.points) {
      if (!point) continue;
      expect(point.x).toBeGreaterThanOrEqual(40);
      expect(point.x).toBeLessThanOrEqual(560);
      expect(point.y).toBeGreaterThanOrEqual(20);
      expect(point.y).toBeLessThanOrEqual(150);
    }
  }
  expect(chartCoordinates([null, 100, 0], true).points).toEqual([
    null,
    { x: 300, y: 20 },
    { x: 560, y: 150 },
  ]);
});
