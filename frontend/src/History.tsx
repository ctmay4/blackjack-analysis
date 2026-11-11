import { useEffect, useState } from "react";
import { sessionController } from "./session-controller";
import type { SessionHistory, SessionJournal } from "./session-history";
import { REVIEW_ROUND_LIMIT } from "./session-history";
import type { CardData } from "./engine/types";
import "./history.css";

const percent = (correct: number, decisions: number) =>
  decisions ? `${Math.round((correct / decisions) * 100)}%` : "—";
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    signDisplay: "exceptZero",
  }).format(value);
const date = (value: number | null) =>
  value === null
    ? "Before history was enabled"
    : new Date(value).toLocaleString();
const cards = (values: (CardData | null)[]) =>
  values
    .map((value) => (value ? `${value.rank}${value.suit}` : "[hidden]"))
    .join(" · ");

function SessionReview({ session }: { session: SessionJournal }) {
  const [mistakesOnly, setMistakesOnly] = useState(false);
  const rounds = session.rounds
    .slice()
    .reverse()
    .filter(
      (round) => !mistakesOnly || round.decisions.some((item) => !item.correct),
    );
  return (
    <>
      <h3>Session review</h3>
      <p className="form-note">
        Started: {date(session.startedAt)}
        <br />
        Ended: {date(session.endedAt)} ·{" "}
        {session.reason === "replaced"
          ? "Replaced by a new session"
          : "Ended by you"}
        <br />
        {session.config.practice} practice · {session.config.feedback_mode}{" "}
        feedback
        <br />
        {session.config.rules.decks} decks ·{" "}
        {session.config.rules.dealer_hits_soft_17 ? "H17" : "S17"} · Surrender{" "}
        {session.config.rules.allow_surrender ? "on" : "off"} · DAS{" "}
        {session.config.rules.double_after_split ? "on" : "off"}
        <br />
        {session.stats.correctDecisions} of {session.stats.decisions} decisions
        correct ·{" "}
        {percent(session.stats.correctDecisions, session.stats.decisions)}{" "}
        accuracy
        <br />
        {session.stats.rounds} settled rounds · Profit{" "}
        {money(session.bankroll - session.config.bankroll)}
      </p>
      <details>
        <summary>All saved table rules</summary>
        <p className="form-note">
          Wager {money(session.config.bet)} · Starting bankroll{" "}
          {money(session.config.bankroll)}
          <br />
          Maximum splits {session.config.rules.max_splits} · Re-split aces{" "}
          {session.config.rules.resplit_aces ? "on" : "off"}
          <br />
          One card on split aces{" "}
          {session.config.rules.one_card_on_split_aces ? "on" : "off"} · Shuffle
          fraction {session.config.rules.penetration}
        </p>
      </details>
      <p className="form-note">
        Read-only review; ended sessions cannot be resumed. The latest{" "}
        {REVIEW_ROUND_LIMIT} rounds per session are retained; statistics include
        the whole session.
        {session.partial &&
          " Some earlier choices could not be reconstructed, for example because the session or an older tab predated history recording."}
        {session.config.feedback_mode === "delayed" &&
          " Choices in unfinished rounds were not scored."}
      </p>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={mistakesOnly}
          onChange={(event) => setMistakesOnly(event.target.checked)}
        />
        Mistakes only
      </label>
      {!rounds.length && (
        <p className="form-note">
          No{" "}
          {mistakesOnly ? "mistakes in the retained rounds" : "rounds recorded"}
          .
        </p>
      )}
      {rounds.map((round, index) => (
        <details
          className="history-round"
          key={round.number}
          open={index === 0}
        >
          <summary>
            Round {round.number} · {round.complete ? "Complete" : "Unfinished"}
            {round.profit !== null ? ` · ${money(round.profit)}` : ""}
          </summary>
          <p className="form-note">Dealer: {cards(round.dealer)}</p>
          {round.hands.map((hand, handIndex) => (
            <p className="form-note" key={handIndex}>
              Hand {handIndex + 1}: {cards(hand.cards)} ·{" "}
              {hand.outcome ?? "unsettled"}
              {hand.profit !== null ? ` · ${money(hand.profit)}` : ""}
            </p>
          ))}
          {!round.decisions.length && (
            <p className="form-note">No recorded choices for this round.</p>
          )}
          <ol className="history-decisions">
            {round.decisions
              .filter((item) => !mistakesOnly || !item.correct)
              .map((item, decisionIndex) => (
                <li key={decisionIndex}>
                  <strong>
                    {item.correct ? "Correct" : "Mistake"}
                    {!item.scored && " (not scored)"}
                  </strong>
                  <p>
                    Hand {item.hand + 1}: {cards(item.cards)} vs{" "}
                    {cards([item.dealer])}
                  </p>
                  <p>
                    Chose {item.chosen} · Recommended {item.recommended}
                  </p>
                  <p>{item.explanation}</p>
                </li>
              ))}
          </ol>
        </details>
      ))}
    </>
  );
}

export default function History({
  onClear,
}: {
  onClear?: () => Promise<void>;
}) {
  const [history, setHistory] = useState<SessionHistory | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  useEffect(() => {
    let cancelled = false;
    sessionController
      .history()
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((error: Error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const refresh = async (clear = false) => {
    if (
      clear &&
      !window.confirm(
        "Delete all saved session history? This cannot be undone. Your active practice and scores will be kept.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (clear) {
        await sessionController.clearHistory();
        setSelected(null);
        await onClear?.();
      }
      setHistory(await sessionController.history());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not load saved history.",
      );
      setHistory(null);
    } finally {
      setBusy(false);
    }
  };
  const session = history?.sessions.find((item) => item.id === selected);
  const stats = history?.totals.stats;
  return (
    <div className="history-panel">
      <p className="dialog-intro">
        Ended and replaced sessions saved in this browser. Active-session scores
        are excluded until you end or replace the session. Clearing site data
        removes history; there is no cloud backup.
      </p>
      <div className="history-tools">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh history
        </button>
        <button
          className="text-button"
          disabled={busy || (!error && !history?.sessions.length)}
          onClick={() => void refresh(true)}
        >
          Delete saved history
        </button>
      </div>
      {error && (
        <p className="form-warning" role="alert">
          {error}
        </p>
      )}
      {!history && !error && <p role="status">Loading saved history…</p>}
      {history && stats && (
        <>
          {session ? (
            <>
              <button
                className="button secondary full-width"
                onClick={() => setSelected(null)}
              >
                Back to all sessions
              </button>
              <SessionReview key={session.id} session={session} />
            </>
          ) : (
            <>
              <h3>Cumulative progress</h3>
              <p className="history-totals" aria-label="Cumulative statistics">
                {history.sessions.length} ended sessions · {stats.correct} of{" "}
                {stats.decisions} decisions correct ·{" "}
                {percent(stats.correct, stats.decisions)} accuracy
                <br />
                {stats.rounds} settled rounds · {stats.hands} resolved hands ·
                Best streak {stats.best_streak}
                <br />
                {stats.wins} wins · {stats.losses} losses · {stats.pushes}{" "}
                pushes · {stats.surrenders} surrenders
                <br />
                Total settled profit: {money(history.totals.profit)}
              </p>
              <p className="form-note">
                Accuracy is weighted by decisions, not averaged across sessions.
                Profit uses virtual money and excludes unfinished rounds.
              </p>
              {stats.breakdown.map((row) => (
                <div className="breakdown-row" key={row.kind}>
                  <span>{row.kind} hands</span>
                  <strong>
                    {percent(row.correct, row.decisions)}{" "}
                    <small>
                      {row.correct} / {row.decisions}
                    </small>
                  </strong>
                </div>
              ))}
              {!!stats.missed_situations.length && (
                <h3 className="review-heading">Most missed across sessions</h3>
              )}
              {stats.missed_situations.map((item) => (
                <div className="review-item" key={item.situation}>
                  <span>{item.situation}</span>
                  <span>{item.count} misses</span>
                </div>
              ))}
              <h3 className="review-heading">Saved sessions</h3>
              {!history.sessions.length && (
                <p className="form-note">
                  No saved sessions yet. End a practice session to see it here.
                </p>
              )}
              {history.sessions.slice(0, limit).map((item, index) => (
                <button
                  className="history-session"
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                >
                  <strong>
                    Review session {history.sessions.length - index} ·{" "}
                    {date(item.endedAt)}
                  </strong>
                  <span>
                    {item.config.practice} · {item.stats.decisions} decisions ·{" "}
                    {percent(item.stats.correctDecisions, item.stats.decisions)}{" "}
                    · {money(item.bankroll - item.config.bankroll)}
                  </span>
                </button>
              ))}
              {history.sessions.length > limit && (
                <button
                  className="button secondary full-width"
                  onClick={() => setLimit((value) => value + 25)}
                >
                  Show more sessions
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
