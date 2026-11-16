export interface TimedRun {
  duration: number;
  elapsed: number;
  since: number | null;
  decisions: number;
  correct: number;
  finished: boolean;
}

export function startTimedRun(seconds: number, now: number): TimedRun {
  if (![60, 180, 300].includes(seconds)) throw new Error("Invalid duration");
  return {
    duration: seconds * 1000,
    elapsed: 0,
    since: now,
    decisions: 0,
    correct: 0,
    finished: false,
  };
}

export function advanceTimer(run: TimedRun, now: number): TimedRun {
  if (run.since === null || run.finished) return run;
  const elapsed = Math.min(
    run.duration,
    run.elapsed + Math.max(0, now - run.since),
  );
  return { ...run, elapsed, since: now, finished: elapsed >= run.duration };
}

export function pauseTimer(run: TimedRun, now: number): TimedRun {
  return { ...advanceTimer(run, now), since: null };
}

export function timedResults(run: TimedRun) {
  return {
    accuracy: run.decisions
      ? Math.round((100 * run.correct) / run.decisions)
      : null,
    perMinute: run.elapsed > 0 ? (run.decisions * 60000) / run.elapsed : 0,
  };
}
