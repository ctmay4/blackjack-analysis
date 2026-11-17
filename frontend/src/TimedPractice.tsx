import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "./engine/session-types";
import {
  advanceTimer,
  pauseTimer,
  startTimedRun,
  timedResults,
} from "./timed-practice";
import type { TimedRun } from "./timed-practice";

/** Local challenge only: never writes game state, scores, or storage. */
export function useTimedPractice(
  sessionId: string | undefined,
  blocked: boolean,
  onSetup: () => void,
) {
  const [run, setRun] = useState<TimedRun | null>(null);
  const current = useRef(run);
  const [seconds, setSeconds] = useState(60);
  const update = (next: TimedRun | null) => {
    current.current = next;
    setRun(next);
  };
  useEffect(() => {
    update(null);
  }, [sessionId]);
  useEffect(() => {
    const pause = () => {
      if (current.current && (blocked || document.hidden))
        update(pauseTimer(current.current, performance.now()));
    };
    pause();
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [blocked]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (current.current?.since !== null && current.current)
        update(advanceTimer(current.current, performance.now()));
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  // Called only after a successful commit. Failed/illegal choices and Next
  // never contribute. Delayed feedback contributes when its scores are released.
  function record(before: Snapshot, after: Snapshot) {
    const active = current.current;
    if (
      !active ||
      active.since === null ||
      active.finished ||
      before.session_id !== after.session_id
    )
      return;
    const next = advanceTimer(active, performance.now());
    if (!next.finished) {
      next.decisions += Math.max(
        0,
        after.stats.decisions - before.stats.decisions,
      );
      next.correct += Math.max(0, after.stats.correct - before.stats.correct);
    }
    update(next);
  }
  const results = run ? timedResults(run) : null;
  const panel = (
    <section
      className={`timed-toolbar${run ? " is-active" : ""}`}
      aria-label="Timed practice"
    >
      {!run ? (
        <button
          className="button secondary"
          disabled={blocked}
          onClick={onSetup}
        >
          Start timed practice
        </button>
      ) : (
        <>
          <div className="timed-status">
            <p role="status">
              {run.finished
                ? "Timed practice complete"
                : run.since === null
                  ? "Timed practice paused"
                  : "Timed practice running"}
            </p>
            <p role="timer" aria-label="Time remaining">
              {Math.ceil((run.duration - run.elapsed) / 1000)} seconds remaining
            </p>
          </div>
          <p className="timed-metrics">
            {run.decisions} scored decisions ·{" "}
            {results!.accuracy === null
              ? "No accuracy yet"
              : `${results!.accuracy}% accuracy`}{" "}
            · {results!.perMinute.toFixed(1)} decisions/min
          </p>
          <div className="timed-actions">
            {!run.finished && (
              <>
                <button
                  className="button secondary"
                  disabled={blocked}
                  onClick={() => {
                    const latest = current.current!;
                    update(
                      latest.since === null
                        ? { ...latest, since: performance.now() }
                        : pauseTimer(latest, performance.now()),
                    );
                  }}
                >
                  {run.since === null ? "Resume timer" : "Pause timer"}
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    update({
                      ...pauseTimer(current.current!, performance.now()),
                      finished: true,
                    })
                  }
                >
                  Finish timed practice
                </button>
              </>
            )}
            {run.finished && (
              <button className="button secondary" onClick={onSetup}>
                New timed challenge
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
  const setup = (onStarted: () => void) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        update(startTimedRun(seconds, performance.now()));
        onStarted();
      }}
    >
      <label className="field">
        Challenge length
        <select
          value={seconds}
          onChange={(event) => setSeconds(Number(event.target.value))}
        >
          <option value={60}>1 minute</option>
          <option value={180}>3 minutes</option>
          <option value={300}>5 minutes</option>
        </select>
      </label>
      <p className="form-note">
        Optional timer; practice continues when it ends. Dialogs and hidden tabs
        pause it; resume manually. Speed uses active time, including dealing and
        feedback. Only scores committed while running count; delayed choices
        count when the round ends, including choices made before starting or
        while paused. Correction retries follow normal scoring. Timer results
        reset on refresh or session replacement and are not saved to history or
        backups.
      </p>
      <button className="button primary full-width" type="submit">
        Start timed practice
      </button>
    </form>
  );
  return { panel, setup, record, active: !!run };
}
