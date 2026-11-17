import { useEffect, useRef, useState } from "react";
import {
  betUnits,
  defaultRamp,
  defaultSimulationRules,
  deviationAction,
  deviations,
  indexSource,
  simulationNames,
  simulationModes,
  validateSimulation,
} from "./advanced-practice";
import type { SimulationMessage } from "./advanced-practice";
import CountingPractice from "./CountingPractice";
import "./advanced.css";

const countQuestion = () => (Math.floor(Math.random() * 19) - 6) / 2;
const deviationQuestion = () => {
  const target = deviations[Math.floor(Math.random() * deviations.length)];
  return { target, count: target.index + Math.floor(Math.random() * 5) - 2 };
};

export default function AdvancedPractice({
  simulationOnly = false,
  onSimulation,
}: {
  simulationOnly?: boolean;
  onSimulation?: () => void;
}) {
  const [tab, setTab] = useState(simulationOnly ? "ev" : "bet");
  const [rules, setRules] = useState({ ...defaultSimulationRules });
  const [ramp, setRamp] = useState([...defaultRamp]);
  const [count, setCount] = useState(countQuestion);
  const [answer, setAnswer] = useState("");
  const [betFeedback, setBetFeedback] = useState("");
  const [betScore, setBetScore] = useState({ correct: 0, total: 0 });
  const [question, setQuestion] = useState(deviationQuestion);
  const [deviationFeedback, setDeviationFeedback] = useState("");
  const [deviationScore, setDeviationScore] = useState({
    correct: 0,
    total: 0,
  });
  const [seed, setSeed] = useState(42);
  const [blocks, setBlocks] = useState(20);
  const [prediction, setPrediction] = useState("uncertain");
  const [message, setMessage] = useState<SimulationMessage | null>(null);
  const [running, setRunning] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
  };
  const run = () => {
    try {
      const request = { seed, blocks, ramp, rules };
      validateSimulation(request);
      stop();
      const current = new Worker(
        new URL("./advanced.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = current;
      setRunning(true);
      setMessage({ type: "progress", completed: 0, total: blocks });
      current.onmessage = (event: MessageEvent<SimulationMessage>) => {
        if (worker.current !== current) return;
        setMessage(event.data);
        if (event.data.type !== "progress") stop();
      };
      current.onerror = () => {
        setMessage({
          type: "error",
          message: "Simulation worker failed. Try again.",
        });
        stop();
      };
      current.postMessage(request);
    } catch (error) {
      setMessage({
        type: "error",
        message: error instanceof Error ? error.message : "Simulation failed.",
      });
    }
  };
  return (
    <div
      className={`advanced-practice${simulationOnly ? " simulation-layout" : ""}`}
    >
      <p className="advanced-intro">
        Your active hand, basic-strategy scores, and history stay unchanged.
        {simulationOnly
          ? " Simulation settings and results reset when you leave this mode."
          : " Exercise scores and settings reset when this overlay closes."}{" "}
        Virtual units only; not betting advice.
      </p>
      {!simulationOnly && (
        <div
          className="advanced-choices"
          role="group"
          aria-label="Advanced exercise"
        >
          {[
            ["running-count", "Running count"],
            ["true-count", "True count"],
            ["bet", "Bet sizing"],
            ["deviation", "Deviations"],
            ["ev", "Expected value"],
          ].map(([id, label]) => (
            <button
              key={id}
              className="button secondary"
              aria-pressed={tab === id}
              onClick={() =>
                id === "ev" && onSimulation ? onSimulation() : setTab(id)
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {!simulationOnly && (
        <p className="form-note">
          Hi-Lo: 2–6 = +1; 7–9 = 0; tens/aces = −1. True count = running count ÷
          decks remaining. Here, floor toward negative infinity. Counting drills
          use separate cards and supplied deck amounts, not your active session.
        </p>
      )}
      <CountingPractice mode={tab} />
      <fieldset
        className="simulation-ramp"
        disabled={running}
        hidden={tab === "running-count" || tab === "true-count"}
      >
        <legend>Betting ramp (base units)</legend>
        <p>
          Use nondecreasing whole-unit wagers, 1–100. This is a configurable
          exercise, not an optimized bankroll strategy.
        </p>
        <div className="advanced-ramp">
          {ramp.map((value, i) => (
            <label className="field" key={i}>
              TC {i === 0 ? "≤0" : i === 4 ? "≥4" : i}
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                required
                value={value}
                onChange={(e) => {
                  setRamp((old) =>
                    old.map((n, j) => (j === i ? Number(e.target.value) : n)),
                  );
                  setBetFeedback("");
                  setBetScore({ correct: 0, total: 0 });
                  setMessage(null);
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      {tab === "bet" && (
        <section aria-label="Bet sizing exercise">
          <h3>Apply your ramp</h3>
          <p>
            True count: <strong>{count}</strong>. How many base units?
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (betFeedback) return;
              try {
                const expected = betUnits(count, ramp);
                const correct = Number(answer) === expected;
                setBetScore((old) => ({
                  total: old.total + 1,
                  correct: old.correct + Number(correct),
                }));
                setBetFeedback(
                  `${correct ? "Correct." : "Not quite."} Floor TC to ${Math.floor(count)}; your ramp calls for ${expected} units.`,
                );
              } catch (error) {
                setBetFeedback(
                  error instanceof Error ? error.message : "Invalid ramp.",
                );
              }
            }}
          >
            <label className="field">
              Your bet in units
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                required
                value={answer}
                disabled={!!betFeedback}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={!!betFeedback}>
              Check bet
            </button>
          </form>
          <p role="status">{betFeedback}</p>
          <p>
            {betScore.correct} correct / {betScore.total} scored
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setCount(countQuestion());
              setAnswer("");
              setBetFeedback("");
            }}
          >
            Next bet
          </button>
        </section>
      )}
      {tab === "deviation" && (
        <section aria-label="Deviation exercise">
          <h3>Selected Hi-Lo stand/hit indices</h3>
          <p>
            Fixed six-deck S17, no surrender. Four hard, non-pair openings only:
            16 vs 10, 15 vs 10, 12 vs 3, 12 vs 2. Not a complete deviation
            system; insurance and split/double indices are not included.
          </p>
          <p>
            Player {question.target.hand.join(", ")} vs dealer{" "}
            {question.target.dealer}; true count{" "}
            <strong>{question.count}</strong>.
          </p>
          <div className="advanced-choices">
            {(["hit", "stand"] as const).map((action) => (
              <button
                key={action}
                className="button secondary"
                disabled={!!deviationFeedback}
                onClick={() => {
                  const expected = deviationAction(
                    question.target.index,
                    question.count,
                  );
                  const correct = action === expected;
                  setDeviationScore((old) => ({
                    total: old.total + 1,
                    correct: old.correct + Number(correct),
                  }));
                  setDeviationFeedback(
                    `${correct ? "Correct." : "Not quite."} ${expected === "stand" ? "Stand" : "Hit"}: stand at TC ≥ ${question.target.index}, hit below it. This is index practice, not basic-strategy scoring.`,
                  );
                }}
              >
                {action === "hit" ? "Hit" : "Stand"}
              </button>
            ))}
          </div>
          <p role="status">{deviationFeedback}</p>
          <p>
            {deviationScore.correct} correct / {deviationScore.total} scored
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setQuestion(deviationQuestion());
              setDeviationFeedback("");
            }}
          >
            Next deviation
          </button>
          <p>
            <a href={indexSource} target="_blank" rel="noreferrer">
              Index reference: Wizard of Odds, Hi-Lo
            </a>{" "}
            (selected indices attributed there to Don Schlesinger).
          </p>
        </section>
      )}
      {tab === "ev" && (
        <section aria-label="Expected value exercise">
          <h3>Predict, then simulate</h3>
          <p>
            Compare basic strategy with flat betting, basic strategy with your
            ramp, and always standing with flat betting. Predict which flat-bet
            strategy has higher expected profit, then inspect the estimates—not
            just the observed winner.
          </p>
          <form
            className="simulation-form"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <fieldset disabled={running}>
              <legend>Run settings</legend>
              <label className="field">
                Your prediction
                <select
                  value={prediction}
                  onChange={(e) => {
                    setPrediction(e.target.value);
                    setMessage(null);
                  }}
                >
                  <option value="uncertain">Uncertain</option>
                  <option value="basic">Basic strategy</option>
                  <option value="stand">Always stand</option>
                </select>
              </label>
              <label className="field">
                Random seed
                <input
                  type="number"
                  min="0"
                  max="4294967295"
                  step="1"
                  required
                  value={seed}
                  onChange={(e) => {
                    setSeed(Number(e.target.value));
                    setMessage(null);
                  }}
                />
              </label>
              <label className="field">
                Independent blocks (50 rounds each)
                <input
                  type="number"
                  min="20"
                  max="200"
                  step="1"
                  required
                  value={blocks}
                  onChange={(e) => {
                    setBlocks(Number(e.target.value));
                    setMessage(null);
                  }}
                />
              </label>
              <label className="field">
                Decks
                <select
                  value={rules.decks}
                  onChange={(e) => {
                    setRules({ ...rules, decks: Number(e.target.value) });
                    setMessage(null);
                  }}
                >
                  {[2, 4, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Dealer soft 17
                <select
                  value={String(rules.dealer_hits_soft_17)}
                  onChange={(e) => {
                    setRules({
                      ...rules,
                      dealer_hits_soft_17: e.target.value === "true",
                    });
                    setMessage(null);
                  }}
                >
                  <option value="false">Stand (S17)</option>
                  <option value="true">Hit (H17)</option>
                </select>
              </label>
              <label className="field">
                Penetration (%)
                <input
                  type="number"
                  min="50"
                  max="90"
                  step="1"
                  required
                  value={Math.round((1 - rules.penetration) * 100)}
                  onChange={(e) => {
                    setRules({
                      ...rules,
                      penetration: (100 - Number(e.target.value)) / 100,
                    });
                    setMessage(null);
                  }}
                />
              </label>
              <label className="field">
                Maximum splits
                <select
                  value={rules.max_splits}
                  onChange={(e) => {
                    setRules({ ...rules, max_splits: Number(e.target.value) });
                    setMessage(null);
                  }}
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["allow_surrender", "Late surrender"],
                  ["double_after_split", "Double after split"],
                  ["resplit_aces", "Re-split aces"],
                  ["one_card_on_split_aces", "One card on split aces"],
                ] as const
              ).map(([key, label]) => (
                <label className="simulation-check" key={key}>
                  <input
                    type="checkbox"
                    checked={rules[key]}
                    onChange={(e) => {
                      setRules({ ...rules, [key]: e.target.checked });
                      setMessage(null);
                    }}
                  />
                  {label}
                </label>
              ))}
              <button className="button primary">Run simulation</button>
            </fieldset>
          </form>
          {running && (
            <button
              className="button secondary"
              onClick={() => {
                stop();
                setMessage(null);
              }}
            >
              Cancel simulation
            </button>
          )}
          <p role="status">
            {message?.type === "progress"
              ? `Simulating block ${message.completed} / ${message.total}…`
              : message?.type === "error"
                ? message.message
                : message?.type === "result"
                  ? `Simulation complete: ${message.rounds} rounds per strategy.`
                  : ""}
          </p>
          {message?.type === "result" && (
            <>
              <div
                className="advanced-results"
                role="region"
                aria-label="Simulation estimates"
                tabIndex={0}
              >
                <table>
                  <caption>
                    Net base units per initial round; approximate 95% confidence
                    intervals
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Strategy</th>
                      <th scope="col">Mean</th>
                      <th scope="col">Low</th>
                      <th scope="col">High</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulationModes.map((mode) => (
                      <tr key={mode}>
                        <th scope="row">{simulationNames[mode]}</th>
                        {[
                          message.estimates[mode].mean,
                          message.estimates[mode].low,
                          message.estimates[mode].high,
                        ].map((n, i) => (
                          <td key={i}>{n.toFixed(4)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Your prediction:{" "}
                {prediction === "basic"
                  ? "Basic strategy"
                  : prediction === "stand"
                    ? "Always stand"
                    : "Uncertain"}
                .{" "}
                {message.estimates["basic-flat"].low >
                message.estimates["stand-flat"].high
                  ? "The non-overlapping intervals support basic strategy in this run."
                  : message.estimates["stand-flat"].low >
                      message.estimates["basic-flat"].high
                    ? "This run favors always standing; do not treat a noisy sample as proof of a better strategy."
                    : "Intervals overlap; this run does not clearly separate the flat-bet strategies."}
              </p>
            </>
          )}
          <details>
            <summary>Simulation assumptions and limitations</summary>
            <p>
              All strategies use the selected table rules, with 3:2 blackjack
              and no insurance. Penetration is the fraction dealt before a
              shuffle; a minimum reserve of 52 cards can cause earlier shuffles.
              Basic play uses multi-deck S17/H17 tables, not deck-specific
              optimal strategy. Each independent 50-round block starts fresh.
              All dealt cards, including unused dealer hole cards, are revealed
              after settlement for the next betting count. Bets use exact decks
              remaining and floored Hi-Lo TC; no deviations, wonging, or
              bankroll limits. Splits/doubles count in net profit, not the round
              denominator.
            </p>
            <p>
              Results are Monte Carlo estimates, not exact EV, return per unit
              wagered, or risk-of-ruin estimates. Ramp results have different
              exposure and variance. Approximate normal intervals use
              independent block means (not correlated individual rounds); small
              runs may be noisy. Modes share seeds, but different strategies can
              consume different cards. These are not formal paired-difference
              tests. A higher observed profit does not guarantee future profit.
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
