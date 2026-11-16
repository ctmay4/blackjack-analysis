import { useState } from "react";
import { hiLo } from "./advanced-practice";
import {
  runningCount,
  runningCountQuestion,
  trueCount,
  trueCountQuestion,
} from "./counting-practice";

export default function CountingPractice({ mode }: { mode: string }) {
  const [cards, setCards] = useState(runningCountQuestion);
  const [shown, setShown] = useState(0);
  const [conversion, setConversion] = useState(trueCountQuestion);
  const [runningAnswer, setRunningAnswer] = useState("");
  const [trueAnswer, setTrueAnswer] = useState("");
  const [runningFeedback, setRunningFeedback] = useState("");
  const [trueFeedback, setTrueFeedback] = useState("");
  const [runningScore, setRunningScore] = useState({ correct: 0, total: 0 });
  const [trueScore, setTrueScore] = useState({ correct: 0, total: 0 });
  const isRunning = mode === "running-count";
  if (!isRunning && mode !== "true-count") return null;
  const feedback = isRunning ? runningFeedback : trueFeedback;
  const score = isRunning ? runningScore : trueScore;
  const ready = !isRunning || shown === cards.length;
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

  return (
    <section
      aria-label={isRunning ? "Running count exercise" : "True count exercise"}
    >
      <h3>
        {isRunning ? "Keep a Hi-Lo running count" : "Convert to true count"}
      </h3>
      {isRunning ? (
        <>
          <p>
            Start at 0. Reveal ten cards one at a time and keep a mental count.
            Previous cards are hidden until you check your answer. Each sequence
            comes from a fresh shuffled single deck, not your practice shoe.
            This is self-paced, not timed.
          </p>
          <p
            className="counting-card"
            role="status"
            aria-label="Current counting card"
          >
            {shown === 0
              ? "No cards revealed"
              : `Card ${shown} of ${cards.length}: ${cards[shown - 1].rank}${cards[shown - 1].suit}`}
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={shown === cards.length}
            onClick={() => setShown((old) => Math.min(cards.length, old + 1))}
          >
            Reveal next card
          </button>
        </>
      ) : (
        <>
          <p>
            Divide the running count by the supplied decks remaining, then floor
            toward negative infinity—not toward zero. For example, −5 ÷ 2 = −2.5
            → −3. Deck estimation is not tested here.
          </p>
          <p>
            Running count: <strong>{conversion.running}</strong>; decks
            remaining: <strong>{conversion.decks}</strong>.
          </p>
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || feedback) return;
          const answer = isRunning ? runningAnswer : trueAnswer;
          if (!answer.trim() || !Number.isSafeInteger(Number(answer))) return;
          const expected = isRunning
            ? runningCount(cards)
            : trueCount(conversion.running, conversion.decks);
          const correct = Number(answer) === expected;
          const setScore = isRunning ? setRunningScore : setTrueScore;
          setScore((old) => ({
            total: old.total + 1,
            correct: old.correct + Number(correct),
          }));
          const explanation = isRunning
            ? `Final running count: ${signed(expected)}. Review the tags and cumulative count below.`
            : `${conversion.running} ÷ ${conversion.decks} = ${Number((conversion.running / conversion.decks).toFixed(4))}; floor toward negative infinity → ${expected}.`;
          (isRunning ? setRunningFeedback : setTrueFeedback)(
            `${correct ? "Correct." : "Not quite."} ${explanation}`,
          );
        }}
      >
        <label className="field">
          {isRunning ? "Your running count" : "Your floored true count"}
          <input
            type="number"
            step="1"
            required
            value={isRunning ? runningAnswer : trueAnswer}
            disabled={!ready || !!feedback}
            onChange={(e) =>
              (isRunning ? setRunningAnswer : setTrueAnswer)(e.target.value)
            }
          />
        </label>
        <button className="button primary" disabled={!ready || !!feedback}>
          {isRunning ? "Check running count" : "Check true count"}
        </button>
      </form>
      <p role="status">{feedback}</p>
      <p>
        {score.correct} correct / {score.total} scored
      </p>
      {isRunning && runningFeedback && (
        <div
          className="advanced-results"
          role="region"
          aria-label="Running count review"
          tabIndex={0}
        >
          <table>
            <caption>Sequence review</caption>
            <thead>
              <tr>
                <th scope="col">Card</th>
                <th scope="col">Hi-Lo tag</th>
                <th scope="col">Running count</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card, i) => (
                <tr key={i}>
                  <th scope="row">
                    {i + 1}: {card.rank}
                    {card.suit}
                  </th>
                  <td>{signed(hiLo(card.value))}</td>
                  <td>{signed(runningCount(cards.slice(0, i + 1)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          if (isRunning) {
            setCards(runningCountQuestion());
            setShown(0);
            setRunningAnswer("");
            setRunningFeedback("");
          } else {
            setConversion(trueCountQuestion());
            setTrueAnswer("");
            setTrueFeedback("");
          }
        }}
      >
        {isRunning ? "Next sequence" : "Next conversion"}
      </button>
    </section>
  );
}
