import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { ApiError, defaults, request } from "./api";
import type { Action, CardData, ChartSection, Config, Snapshot } from "./api";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
const signedMoney = (value: number) => `${value > 0 ? "+" : ""}${money(value)}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const practiceNames: Record<Config["practice"], string> = {
  all: "All hands",
  hard: "Hard hands",
  soft: "Soft hands",
  pair: "Pairs",
  surrender: "Surrender",
  missed: "Frequently missed",
};
const feedbackNames = {
  immediate: "Immediate feedback",
  correction: "Require correction",
  delayed: "After the round",
};
const controls: { action: Action; label: string; key: string }[] = [
  { action: "hit", label: "Hit", key: "H" },
  { action: "stand", label: "Stand", key: "S" },
  { action: "double", label: "Double", key: "D" },
  { action: "split", label: "Split", key: "P" },
  { action: "surrender", label: "Surrender", key: "R" },
];
type Overlay = "settings" | "chart" | "stats" | "help" | "summary" | null;

function Card({ data }: { data: CardData | null }) {
  if (!data)
    return <div className="card back" role="img" aria-label="Face-down card" />;
  const suitNames: Record<string, string> = {
    "♥": "hearts",
    "♦": "diamonds",
    "♠": "spades",
    "♣": "clubs",
  };
  return (
    <div
      className={`card${["♥", "♦"].includes(data.suit) ? " red" : ""}`}
      role="img"
      aria-label={`${data.rank} of ${suitNames[data.suit] || "unspecified suit"}`}
    >
      <span className="card-corner" aria-hidden="true">
        {data.rank}
        <small>{data.suit}</small>
      </span>
      <span className="card-center" aria-hidden="true">
        {data.suit}
      </span>
      <span className="card-bottom" aria-hidden="true">
        {data.rank}
      </span>
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== ref.current) return;
        const bounds = ref.current.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className="dialog-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close overlay"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Settings({
  initial,
  existing,
  busy,
  onSubmit,
}: {
  initial: Config;
  existing: boolean;
  busy: boolean;
  onSubmit: (config: Config) => void;
}) {
  const [config, setConfig] = useState<Config>(() => structuredClone(initial));
  const [confirming, setConfirming] = useState(false);
  const change = <K extends keyof Config>(key: K, value: Config[K]) => {
    setConfirming(false);
    setConfig((old) => ({ ...old, [key]: value }));
  };
  const rule = <K extends keyof Config["rules"]>(
    key: K,
    value: Config["rules"][K],
  ) => {
    setConfirming(false);
    setConfig((old) => ({ ...old, rules: { ...old.rules, [key]: value } }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (existing && !confirming) {
      setConfirming(true);
      return;
    }
    onSubmit(config);
  };
  return (
    <form onSubmit={submit}>
      <p className="dialog-intro">
        {existing
          ? "Choose your next focus. Starting a new session resets the current hands, bankroll, and statistics."
          : "Set your pace. All money is virtual, and there’s no timer."}
      </p>
      <fieldset disabled={busy} className="settings-fields">
        <label className="field">
          Practice focus
          <select
            value={config.practice}
            onChange={(event) =>
              change("practice", event.target.value as Config["practice"])
            }
          >
            {Object.entries(practiceNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Feedback mode
          <select
            value={config.feedback_mode}
            onChange={(event) =>
              change(
                "feedback_mode",
                event.target.value as Config["feedback_mode"],
              )
            }
          >
            {Object.entries(feedbackNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="field-grid">
          <label className="field">
            Starting bankroll
            <input
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              required
              value={config.bankroll}
              onChange={(event) =>
                change("bankroll", Number(event.target.value))
              }
            />
          </label>
          <label className="field">
            Wager
            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              required
              value={config.bet}
              onChange={(event) => change("bet", Number(event.target.value))}
            />
          </label>
        </div>
        <details open={config.practice === "surrender" ? true : undefined}>
          <summary>Table rules</summary>
          <label className="field">
            Dealer behavior
            <select
              value={String(config.rules.dealer_hits_soft_17)}
              onChange={(event) =>
                rule("dealer_hits_soft_17", event.target.value === "true")
              }
            >
              <option value="false">Stand on soft 17</option>
              <option value="true">Hit on soft 17</option>
            </select>
          </label>
          <div className="field-grid">
            <label className="field">
              Decks
              <select
                value={config.rules.decks}
                onChange={(event) => rule("decks", Number(event.target.value))}
              >
                {Array.from({ length: 8 }, (_, index) => index + 1).map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label className="field">
              Maximum splits
              <select
                value={config.rules.max_splits}
                onChange={(event) =>
                  rule("max_splits", Number(event.target.value))
                }
              >
                {[0, 1, 2, 3].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Shoe fraction remaining before shuffle
            <input
              type="number"
              min="0.01"
              max="0.99"
              step="0.01"
              required
              value={config.rules.penetration}
              onChange={(event) =>
                rule("penetration", Number(event.target.value))
              }
            />
          </label>
          {(
            [
              ["allow_surrender", "Late surrender"],
              ["double_after_split", "Double after split"],
              ["resplit_aces", "Re-split aces"],
              ["one_card_on_split_aces", "One card on split aces"],
            ] as const
          ).map(([key, label]) => (
            <label className="checkbox-field" key={key}>
              <input
                type="checkbox"
                checked={config.rules[key]}
                onChange={(event) => rule(key, event.target.checked)}
              />
              {label}
            </label>
          ))}
        </details>
        {config.practice === "surrender" && !config.rules.allow_surrender && (
          <p className="form-warning" role="status">
            Enable late surrender above to practice surrender.
          </p>
        )}
        {confirming && (
          <p className="confirmation" role="status">
            Ready to start fresh? Your current session will be replaced. This
            cannot be undone.
          </p>
        )}
        <button
          className="button primary full-width"
          disabled={
            busy ||
            (config.practice === "surrender" && !config.rules.allow_surrender)
          }
        >
          {busy
            ? "Starting…"
            : !existing
              ? "Start practice →"
              : confirming
                ? "Confirm new session"
                : "Start new session"}
        </button>
      </fieldset>
      <p className="form-note">
        Local, in-memory practice. Refreshing keeps your session; restarting the
        server or 12 hours of inactivity clears it. Wagers aren’t capped by your
        virtual bankroll.
      </p>
    </form>
  );
}

function Stats({ state }: { state: Snapshot }) {
  const stats = state.stats;
  return (
    <>
      <p className="dialog-intro">
        {stats.correct} of {stats.decisions} decisions on strategy · Best
        streak: {stats.best_streak}
      </p>
      {stats.breakdown.map((row) => (
        <div className="breakdown-row" key={row.kind}>
          <span>
            {row.kind === "pair"
              ? "Pairs"
              : `${row.kind[0].toUpperCase()}${row.kind.slice(1)} hands`}
          </span>
          <strong>
            {row.decisions ? percent(row.accuracy) : "—"}{" "}
            <small>
              {row.correct} / {row.decisions}
            </small>
          </strong>
        </div>
      ))}
      <h3 className="review-heading">Worth another look</h3>
      {!stats.missed_situations.length && (
        <p className="form-note">No missed situations yet. Keep practicing.</p>
      )}
      {stats.missed_situations.map((item) => (
        <div className="review-item" key={item.situation}>
          <span>{item.situation}</span>
          <span>
            {item.count} {item.count === 1 ? "miss" : "misses"}
          </span>
        </div>
      ))}
      <h3 className="review-heading">At the table</h3>
      <p className="form-note">
        {stats.rounds} rounds · {stats.hands} resolved hands
        <br />
        {stats.wins} wins · {stats.losses} losses · {stats.pushes} pushes ·{" "}
        {stats.surrenders} surrenders
        <br />
        Session profit: {signedMoney(state.bankroll - state.config.bankroll)}
      </p>
      <p className="form-note">
        Accuracy measures decisions, not whether the hand won. Unfinished rounds
        are not counted as outcomes.
      </p>
    </>
  );
}

function Help() {
  return (
    <>
      <div className="shortcut-list">
        {[
          ["Hit", "H"],
          ["Stand", "S"],
          ["Double down", "D"],
          ["Split", "P"],
          ["Surrender, when available", "R"],
          ["Next hand", "Enter"],
          ["Strategy chart", "T"],
          ["Session progress", "V"],
          ["Session summary / end session", "Q"],
          ["Help", "?"],
          ["Close overlay", "Esc"],
        ].map(([label, key]) => (
          <div key={key}>
            <span>{label}</span>
            <kbd>{key}</kbd>
          </div>
        ))}
      </div>
      <p className="form-note">
        Immediate feedback plays your choice, even if it’s incorrect.
        Require-correction mode asks you to retry instead. Delayed mode scores
        decisions only after the round ends. Charts remain available as an
        explicit reference in every mode. Press Q to open your summary, then Q
        again to end the session. Escape returns to practice without ending it.
      </p>
    </>
  );
}

export default function App() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [chart, setChart] = useState<ChartSection[] | null>(null);
  const [chartError, setChartError] = useState("");
  const actionsRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await request<Snapshot>("session"));
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState(null);
      else
        setError(
          err instanceof Error
            ? err.message
            : "Could not reach the local server.",
        );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (path: string, method: string, body: unknown, close = false) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        setState(await request<Snapshot | null>(path, method, body));
        if (close) {
          setOverlay(null);
          setChart(null);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Could not reach the local server.";
        if (err instanceof ApiError && err.status === 404) {
          setState(null);
          setOverlay(null);
        }
        // Never replay an uncertain action. Reconcile server state instead.
        else {
          try {
            setState(await request<Snapshot>("session"));
          } catch (refreshError) {
            if (
              refreshError instanceof ApiError &&
              refreshError.status === 404
            ) {
              setState(null);
              setOverlay(null);
            }
          }
        }
        setError(message);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const perform = useCallback(
    async (action: Action | "next") => {
      if (!state || busyRef.current) return;
      if (
        action === "next"
          ? state.status !== "complete"
          : !state.available_actions.includes(action)
      )
        return;
      await mutate("action", "POST", { revision: state.revision, action });
      requestAnimationFrame(() =>
        actionsRef.current
          ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
          ?.focus({ preventScroll: true }),
      );
    },
    [state, mutate],
  );

  const endSession = useCallback(() => {
    if (state)
      void mutate("session", "DELETE", { revision: state.revision }, true);
  }, [state, mutate]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        busyRef.current
      )
        return;
      const target = event.target as HTMLElement;
      if (target.closest("select,input,textarea,[contenteditable]")) return;
      const key = event.key.toLowerCase();
      if (overlay) {
        if (overlay === "summary" && key === "q") {
          event.preventDefault();
          endSession();
        }
        return;
      }
      if (
        (key === "enter" || key === " ") &&
        target.closest("button,a,summary")
      )
        return;
      if (key === "?" || (state && ["t", "v", "q"].includes(key))) {
        event.preventDefault();
        setOverlay(
          key === "?"
            ? "help"
            : key === "t"
              ? "chart"
              : key === "v"
                ? "stats"
                : "summary",
        );
        return;
      }
      const shortcuts: Record<string, Action | "next"> = {
        h: "hit",
        s: "stand",
        d: "double",
        p: "split",
        r: "surrender",
        enter: "next",
      };
      const action = shortcuts[key];
      if (action) {
        event.preventDefault();
        void perform(action);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay, state, perform, endSession]);

  useEffect(() => {
    if (overlay !== "chart") return;
    let cancelled = false;
    setChartError("");
    request<ChartSection[]>("chart")
      .then((data) => {
        if (!cancelled) setChart(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setChartError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [overlay]);

  const complete = state?.status === "complete";
  const stats = state?.stats;
  const net = state ? state.bankroll - state.config.bankroll : 0;
  const saveSettings = (config: Config) =>
    void mutate(
      "session",
      state ? "PUT" : "POST",
      state ? { revision: state.revision, config } : config,
      true,
    );
  const open = (value: Overlay) => {
    if (!busy) setOverlay(value);
  };
  const feedbackTitle = !state
    ? ""
    : state.feedback_detail.illegal
      ? "That action isn’t available"
      : state.feedback_detail.correct === false
        ? state.config.feedback_mode === "correction"
          ? "Let’s try that again"
          : `Better move: ${state.feedback_detail.recommendation}`
        : state.feedback_detail.correct === true
          ? "On strategy. Nicely done."
          : complete
            ? "Round complete"
            : state.config.feedback_mode === "delayed" &&
                state.feedback_detail.chosen
              ? "Choice played"
              : "What’s your move?";
  const feedbackTone =
    state?.feedback_detail.correct === false || state?.feedback_detail.illegal
      ? "mistake"
      : complete
        ? "complete"
        : "";

  return (
    <div className={`app-shell live-app${state ? " is-playing" : ""}`}>
      <header className="app-header">
        <a className="brand" href="/" aria-label="Blackjack Studio home">
          <span className="brand-mark">♠</span>
          <span>
            blackjack<span className="brand-light"> / studio</span>
            <small>A LITTLE PRACTICE. A BETTER GAME.</small>
          </span>
        </a>
        <nav aria-label="Tools">
          <span className="local-label">
            <span className="status-dot" /> Local session
          </span>
          <button
            className="icon-button"
            onClick={() => open("help")}
            aria-label="Open help"
          >
            ?
          </button>
          <button
            className="icon-button"
            disabled={!state || busy}
            onClick={() => open("settings")}
            aria-label="Open session settings"
          >
            ⚙
          </button>
        </nav>
      </header>
      <main>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              className="text-button"
              disabled={busy || loading}
              onClick={() => void load()}
            >
              Reload state ↗
            </button>
          </div>
        )}
        {loading ? (
          <div className="loading-state" role="status">
            Getting the table ready…
          </div>
        ) : !state ? (
          <div className="setup-layout">
            <div className="setup-intro">
              <div className="eyebrow">WELCOME TO THE PRACTICE ROOM</div>
              <h1>
                A little practice.
                <br />A better game.
              </h1>
              <p>
                Build confidence one decision at a time.
                <br />
                No pressure, no real money. Just progress.
              </p>
              <div className="setup-cards" aria-hidden="true">
                <Card data={{ rank: "A", suit: "♠", value: 11 }} />
                <Card data={{ rank: "K", suit: "♥", value: 10 }} />
              </div>
              <div className="quiet-note">
                <span>✧</span>
                <p>
                  Focus on the decision, not the outcome.
                  <br />A good move can still lose a hand.
                </p>
              </div>
            </div>
            <section
              className="panel setup-panel"
              aria-labelledby="setup-title"
            >
              <div className="eyebrow">MAKE IT YOURS</div>
              <h2 id="setup-title">Set up your practice</h2>
              <Settings
                initial={defaults}
                existing={false}
                busy={busy}
                onSubmit={saveSettings}
              />
            </section>
          </div>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">THE PRACTICE ROOM</div>
                <h1>Make your next move better.</h1>
                <p>No pressure. Just you, the cards, and a little progress.</p>
              </div>
              <button
                className="button secondary chart-trigger"
                onClick={() => open("chart")}
                aria-label="Open strategy chart"
              >
                <span aria-hidden="true">▦</span> Strategy chart <kbd>T</kbd>
              </button>
            </div>
            <div className="mobile-stats" aria-label="Session at a glance">
              <div>
                <span>Accuracy</span>
                <strong>
                  {stats!.decisions ? percent(stats!.accuracy) : "—"}
                </strong>
              </div>
              <div>
                <span>Streak</span>
                <strong>{stats!.current_streak}</strong>
              </div>
              <div>
                <span>Bankroll</span>
                <strong>{money(state.bankroll)}</strong>
              </div>
            </div>
            <div className="workspace">
              <section
                className="table-panel"
                aria-label="Blackjack practice table"
                aria-busy={busy}
              >
                <div className="table-toolbar">
                  <span className="table-label">
                    <span className="status-dot" /> BASIC STRATEGY
                  </span>
                  <span className="rules-summary">
                    {state.config.rules.decks} decks <span>·</span>{" "}
                    {state.config.rules.dealer_hits_soft_17
                      ? "Hit soft 17"
                      : "Stand soft 17"}{" "}
                    <span>·</span> 3:2
                  </span>
                </div>
                <div className="play-surface">
                  <div className="table-watermark" aria-hidden="true">
                    ♠
                  </div>
                  <section className="dealer-zone" aria-label="Dealer hand">
                    <div className="hand-heading">
                      DEALER{" "}
                      <span>
                        {complete
                          ? state.dealer_total
                          : `${state.dealer_cards[0]?.value === 11 ? "A" : state.dealer_cards[0]?.value} showing`}
                      </span>
                    </div>
                    <div
                      className="cards"
                      style={
                        {
                          "--card-count": state.dealer_cards.length,
                        } as CSSProperties
                      }
                    >
                      {state.dealer_cards.map((data, index) => (
                        <Card key={index} data={data} />
                      ))}
                    </div>
                  </section>
                  <div className="table-divider">
                    <span>BLACKJACK PAYS 3 TO 2</span>
                  </div>
                  <section className="player-zone" aria-label="Your hands">
                    <div
                      className={`player-hands${state.hands.length > 1 ? " is-split" : ""}`}
                    >
                      {state.hands.map((hand, index) => (
                        <div
                          key={index}
                          className={`player-hand${hand.active && state.hands.length > 1 ? " split-active" : ""}${!hand.active && !complete ? " split-inactive" : ""}`}
                        >
                          <div className="hand-heading">
                            {state.hands.length === 1
                              ? "YOUR HAND"
                              : `HAND ${index + 1} · ${complete ? "DONE" : hand.active ? "YOUR TURN" : hand.finished ? "DONE" : "WAITING"}`}
                            <span>
                              {hand.soft ? "Soft " : ""}
                              {hand.total}
                              {hand.total > 21 ? " · BUST" : ""}
                              {hand.outcome
                                ? ` · ${hand.outcome.toUpperCase()}`
                                : ""}
                            </span>
                          </div>
                          <div
                            className="cards"
                            style={
                              {
                                "--card-count": hand.cards.length,
                              } as CSSProperties
                            }
                          >
                            {hand.cards.map((data, cardIndex) => (
                              <Card key={cardIndex} data={data} />
                            ))}
                          </div>
                          <div className="hand-bet">
                            <span>
                              <span className="bet-chip" aria-hidden="true">
                                ◈
                              </span>{" "}
                              {money(hand.bet)} wager
                              {hand.profit !== null
                                ? ` · ${signedMoney(hand.profit)}`
                                : ""}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="round-caption">
                    Round {state.round_number} <span>·</span>{" "}
                    {complete
                      ? `Complete · ${signedMoney(state.round_profit!)}`
                      : "Your turn"}
                  </div>
                </div>
                <div className="decision-area">
                  <div
                    className={`feedback ${feedbackTone}`}
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <span className="feedback-icon" aria-hidden="true">
                      {feedbackTone === "mistake" ? "!" : complete ? "✓" : "↗"}
                    </span>
                    <div>
                      <strong>{feedbackTitle}</strong>
                      <p>{state.feedback}</p>
                    </div>
                  </div>
                  <div className="actions" ref={actionsRef}>
                    {complete ? (
                      <button
                        className="action-button next"
                        disabled={busy}
                        onClick={() => void perform("next")}
                      >
                        Next hand <span aria-hidden="true">→</span>
                        <kbd>Enter</kbd>
                      </button>
                    ) : (
                      controls
                        .filter(
                          (control) =>
                            control.action !== "surrender" ||
                            state.config.rules.allow_surrender,
                        )
                        .map((control) => (
                          <button
                            className={`action-button${control.action === "surrender" ? " surrender-action" : ""}`}
                            key={control.action}
                            disabled={
                              busy ||
                              !state.available_actions.includes(control.action)
                            }
                            onClick={() => void perform(control.action)}
                          >
                            {control.label}
                            <kbd>{control.key}</kbd>
                          </button>
                        ))
                    )}
                  </div>
                  <div className="action-footer">
                    <span>
                      {busy
                        ? "Playing your choice…"
                        : complete
                          ? "Ready when you are. There’s no timer."
                          : "Choose an action or use your keyboard"}
                    </span>
                    <button
                      className="text-button"
                      onClick={() => open("help")}
                    >
                      Keyboard shortcuts ↗
                    </button>
                  </div>
                </div>
              </section>
              <aside
                className="sidebar"
                aria-label="Session overview"
                tabIndex={0}
              >
                <section className="panel session-panel">
                  <div className="panel-heading">
                    <h2>Your session</h2>
                    <span className="pill">IN PROGRESS</span>
                  </div>
                  <div className="accuracy-block">
                    <div className="metric-label">Decision accuracy</div>
                    <div className="accuracy-value">
                      {stats!.decisions
                        ? Math.round(stats!.accuracy * 100)
                        : "—"}
                      {stats!.decisions > 0 && <span>%</span>}
                      <span className="accuracy-emblem" aria-hidden="true">
                        ◎
                      </span>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${stats!.accuracy * 100}%` }} />
                    </div>
                    <p className="metric-note">
                      {stats!.correct} of {stats!.decisions} decisions on
                      strategy
                    </p>
                  </div>
                  <div className="mini-metrics">
                    <div>
                      <span className="metric-label">Current streak</span>
                      <strong>
                        {stats!.current_streak}{" "}
                        <span className="streak-icon">↗</span>
                      </strong>
                      <small>Best: {stats!.best_streak}</small>
                    </div>
                    <div>
                      <span className="metric-label">Rounds played</span>
                      <strong>{stats!.rounds}</strong>
                      <small>A little better each hand</small>
                    </div>
                  </div>
                  <button className="panel-link" onClick={() => open("stats")}>
                    Explore your progress <span>↗</span>
                  </button>
                </section>
                <section className="panel bankroll-panel">
                  <div className="panel-heading">
                    <h2>Practice bankroll</h2>
                    <span className="subtle-icon" aria-hidden="true">
                      ◈
                    </span>
                  </div>
                  <div className="bankroll-value">
                    {money(state.bankroll).split(".")[0]}
                    <span>.{money(state.bankroll).split(".")[1]}</span>
                  </div>
                  <div className="bankroll-bottom">
                    <span className={net < 0 ? "negative-profit" : "profit"}>
                      {signedMoney(net)} this session
                    </span>
                    <span>{money(state.config.bet)} wager</span>
                  </div>
                </section>
                <section className="panel practice-panel">
                  <div className="panel-heading">
                    <h2>Your focus</h2>
                    <span className="subtle-icon" aria-hidden="true">
                      ◎
                    </span>
                  </div>
                  <div className="focus-row">
                    <span className="focus-icon">♧</span>
                    <div>
                      <strong>{practiceNames[state.config.practice]}</strong>
                      <p>
                        {state.config.practice === "all"
                          ? "Build a well-rounded foundation"
                          : state.config.practice === "missed"
                            ? "Opening misses from this session"
                            : "One situation at a time"}
                      </p>
                    </div>
                  </div>
                  <div className="settings-chips">
                    <span>{feedbackNames[state.config.feedback_mode]}</span>
                    <span>
                      {state.config.rules.dealer_hits_soft_17 ? "H17" : "S17"}
                    </span>
                    {state.config.rules.allow_surrender && (
                      <span>Surrender</span>
                    )}
                  </div>
                  <button
                    className="panel-link"
                    onClick={() => open("settings")}
                  >
                    Session settings <span>↗</span>
                  </button>
                </section>
                <div className="quiet-note">
                  <span aria-hidden="true">✧</span>
                  <p>
                    Focus on the decision, not the outcome.
                    <br />A good move can still lose a hand.
                  </p>
                </div>
              </aside>
            </div>
            <div className="session-footer">
              <button className="text-button" onClick={() => open("summary")}>
                View session summary ↗
              </button>
            </div>
          </>
        )}
        <footer className="page-footer">
          <span>BUILT FOR BETTER DECISIONS</span>
          <span>
            Basic strategy practice <span className="footer-dot">·</span> No
            real money
          </span>
        </footer>
      </main>
      {overlay && (
        <Modal
          title={
            {
              settings: "Session settings",
              chart: "Strategy chart",
              stats: "Your progress",
              help: "At your fingertips",
              summary: "Session summary",
            }[overlay]
          }
          eyebrow={
            {
              settings: "MAKE IT YOURS",
              chart: "A LITTLE GUIDANCE",
              stats: "SMALL WINS ADD UP",
              help: "FIND YOUR FLOW",
              summary: "ONE HAND BETTER",
            }[overlay]
          }
          onClose={() => {
            if (!busyRef.current) setOverlay(null);
          }}
        >
          {error && (
            <p className="form-warning" role="alert">
              {error}
            </p>
          )}
          {overlay === "settings" && state && (
            <Settings
              initial={state.config}
              existing
              busy={busy}
              onSubmit={saveSettings}
            />
          )}
          {(overlay === "stats" || overlay === "summary") && state && (
            <>
              <Stats state={state} />
              {overlay === "summary" && (
                <>
                  <p className="confirmation">
                    End this session? Your current hand and statistics will be
                    cleared and cannot be recovered. Press Q again to confirm,
                    or Esc to keep practicing.
                  </p>
                  <button
                    className="button primary full-width"
                    disabled={busy}
                    onClick={endSession}
                  >
                    {busy ? "Ending…" : "End session"} <kbd>Q</kbd>
                  </button>
                  <button
                    className="button secondary full-width"
                    disabled={busy}
                    onClick={() => setOverlay(null)}
                  >
                    Back to practice
                  </button>
                </>
              )}
            </>
          )}
          {overlay === "help" && <Help />}
          {overlay === "chart" && (
            <>
              <p className="dialog-intro">
                Two-card opening decisions for your selected rules. Subsequent
                hits and split restrictions can change the best move.
              </p>
              {chartError ? (
                <p className="form-warning" role="alert">
                  {chartError}
                </p>
              ) : !chart ? (
                <p role="status">Loading chart…</p>
              ) : (
                <>
                  <div className="chart-legend">
                    {controls.map((control) => (
                      <span key={control.action}>
                        <b className={`chart-${control.action}`}>
                          {control.action === "split"
                            ? "P"
                            : control.action === "surrender"
                              ? "R"
                              : control.key}
                        </b>
                        {control.label}
                      </span>
                    ))}
                  </div>
                  {chart.map((section) => (
                    <div key={section.name} className="chart-scroll">
                      <table className="strategy-chart">
                        <caption>
                          {section.name} — player hand versus dealer upcard
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">You</th>
                            {[2, 3, 4, 5, 6, 7, 8, 9, 10, "A"].map((value) => (
                              <th scope="col" key={value}>
                                {value}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((row) => (
                            <tr key={row.label}>
                              <th scope="row">{row.label}</th>
                              {row.actions.map((action, index) => (
                                <td
                                  key={index}
                                  className={`chart-${action}`}
                                  title={action}
                                >
                                  {action === "split"
                                    ? "P"
                                    : action === "surrender"
                                      ? "R"
                                      : action[0].toUpperCase()}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
