import { describe, expect, it } from "vitest";
import {
  advanceTimer,
  pauseTimer,
  startTimedRun,
  timedResults,
} from "./timed-practice";

describe("timed practice", () => {
  it("supports bounded durations and rejects invalid ones", () => {
    for (const seconds of [60, 180, 300])
      expect(startTimedRun(seconds, 100).duration).toBe(seconds * 1000);
    for (const seconds of [0, -1, 61, Infinity, NaN])
      expect(() => startTimedRun(seconds, 0)).toThrow();
  });
  it("uses elapsed time rather than tick counts and clamps at the deadline", () => {
    const run = advanceTimer(startTimedRun(60, 100), 70100);
    expect(run.elapsed).toBe(60000);
    expect(run.finished).toBe(true);
    expect(advanceTimer(run, 90000)).toEqual(run);
  });
  it("excludes paused time and resumes with the remaining duration", () => {
    const paused = pauseTimer(startTimedRun(60, 100), 10100);
    expect(paused.elapsed).toBe(10000);
    expect(advanceTimer(paused, 100000)).toEqual(paused);
    const resumed = advanceTimer({ ...paused, since: 100000 }, 110000);
    expect(resumed.elapsed).toBe(20000);
    expect(resumed.finished).toBe(false);
  });
  it("handles zero decisions/time and calculates accuracy and throughput", () => {
    const run = startTimedRun(60, 0);
    expect(timedResults(run)).toEqual({ accuracy: null, perMinute: 0 });
    expect(
      timedResults({ ...run, elapsed: 30000, decisions: 4, correct: 3 }),
    ).toEqual({ accuracy: 75, perMinute: 8 });
  });
  it("does not subtract time if the clock moves backward", () => {
    expect(advanceTimer(startTimedRun(60, 100), 50).elapsed).toBe(0);
  });
});
