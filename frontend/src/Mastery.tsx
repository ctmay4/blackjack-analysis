import { useState } from "react";
import type { Config, Snapshot } from "./engine/session-types";
import {
  exerciseConfig,
  masteryExercises,
  nextExercise,
  sessionMastery,
} from "./session-mastery";

type Exercise = (typeof masteryExercises)[number];

export default function Mastery({
  state,
  busy,
  onStart,
}: {
  state: Snapshot;
  busy: boolean;
  onStart: (config: Config) => void;
}) {
  const [selected, setSelected] = useState<Exercise | null>(null);
  const goal = sessionMastery(state.stats);
  const suggested = nextExercise(state.config.practice);
  return (
    <>
      <h3>Current session goal</h3>
      <p>
        Score at least 20 decisions with at least 90% accuracy this session.
      </p>
      <p role="status">
        {goal.achieved
          ? "Session goal met. Keep practicing or try another exercise."
          : goal.remaining
            ? `${goal.remaining} more scored decisions to reach the minimum.`
            : "Minimum reached. Keep practicing to reach 90% accuracy."}
      </p>
      <p>
        {state.stats.correct} correct / {state.stats.decisions} scored
        decisions. This is a live session goal, not a permanent mastery badge;
        accuracy can fall below the goal as you continue.
      </p>
      <p className="form-note">
        All scored choices count, including later hits and splits. Correction
        retries follow normal session scoring; delayed choices count only when
        the round ends. Illegal actions do not count. Chart drills measure this
        session, not mastery of every chart cell. Profit does not affect the
        goal.
      </p>
      <h3>Choose an exercise</h3>
      <p>
        Suggested path: hard hands → soft hands → pairs → frequently missed →
        mixed practice. You can choose any exercise without meeting the goal.
      </p>
      <div className="mastery-exercises">
        {masteryExercises.map((exercise) => (
          <button
            key={exercise.practice}
            className="button secondary full-width"
            disabled={busy}
            aria-pressed={selected?.practice === exercise.practice}
            onClick={() => setSelected(exercise)}
          >
            {exercise.name}
            {exercise.practice === suggested.practice
              ? " (suggested next)"
              : ""}
          </button>
        ))}
      </div>
      <p className="form-note">
        For one specific opening, select a cell in the strategy chart.
        Frequently missed uses saved and current opening mistakes; without
        usable mistakes it falls back to all hands. Filtered results are not
        profit estimates.
      </p>
      {selected && (
        <section aria-label="Confirm exercise">
          <h3>Start {selected.name.toLowerCase()}?</h3>
          <p className="confirmation">
            Your current session will be saved to history and replaced. Hands,
            bankroll, statistics, and the session goal reset. Rules, wager, and
            feedback mode stay unchanged. Unfinished rounds remain unsettled.
          </p>
          <button
            className="button primary full-width"
            disabled={busy}
            onClick={() =>
              onStart(exerciseConfig(state.config, selected.practice))
            }
          >
            {busy ? "Starting…" : "Start exercise"}
          </button>
          <button
            className="button secondary full-width"
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            Cancel exercise
          </button>
        </section>
      )}
    </>
  );
}
