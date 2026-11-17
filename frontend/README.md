# Blackjack Studio web trainer

React + TypeScript + Vite. The production application is **entirely browser-side**:
no HTTP adapter, Python runtime, server session, account, or backend API remains
in the application. The retired Python runtime, CLI, packaging, tests, and
fixture generators have been removed. Frozen JSON baselines retain independent
regression evidence; the original implementation remains in Git history.

## Develop and build

From the repository root (Node 20.19+ / 22.12+ recommended):

```sh
npm ci --prefix frontend
npm run dev --prefix frontend
```

Open http://127.0.0.1:5173. For the production build:

```sh
npm run build --prefix frontend
npm run preview --prefix frontend
```

Open http://127.0.0.1:4173. `dist/` is standalone static HTML/CSS/JavaScript;
relative Vite assets and home navigation support a GitHub Pages repository path.
Don't open `index.html` through `file://`; use Vite preview or a static web host.
The published trainer is https://ctmay4.github.io/blackjack-analysis/.
The root README describes GitHub Pages deployment. No API URL or server-specific
environment variables are required.

## Offline / PWA

Production builds use `vite-plugin-pwa` / Workbox to precache the app shell,
bundled engine/tables, and icons. The manifest and worker scope use relative URLs
for root hosting and repository subpaths. HTTPS or localhost is required; the
development server does not register a worker. Test with build + preview.

After **Ready for offline use on this device**, the same URL can be reopened
offline, with or without browser installation. Use the browser's install menu,
or Safari's Share → Add to Home Screen. Installation UI/support varies; installed
window behavior still needs manual device coverage.

`src/PwaStatus.tsx` reports readiness/errors and prompts for waiting updates.
Updates are checked on navigation, returning to the app, and reconnecting.
**Later** leaves the current version running; **Reload to update** activates the
waiting worker and reloads open app tabs. Committed IndexedDB sessions/history
are not cleared or migrated by the worker. Old precaches are cleaned on
activation; unrelated sites on the same origin are outside the worker scope.
External Google Fonts are not cached; offline system-font fallbacks are used.
Browser eviction/site-data deletion can remove both caches and saved practice.

## Architecture

- `src/engine/`: pure TypeScript game, strategy, trainer, settings, presentation
  contracts, and validated versioned checkpoints. See [engine notes](src/engine/README.md).
- `src/session-controller.ts`: typed load/start/reset/choose/end/chart/history operations;
  owns session IDs, revisions, entropy, and lifecycle, not blackjack decisions.
- `src/session-history.ts`: versioned session journals, recent-round/decision review,
  conservative validation, archival, and decision-weighted cumulative statistics.
- `src/History.tsx`: read-only history/review dialog, mistake filtering, refresh,
  and confirmed history deletion, available before or during practice.
- `src/HistoryCharts.tsx` / `src/history-charts.ts`: SVG cumulative accuracy and
  settled-profit trends with an accessible exact-value table. Whole-session
  counters (not retained review rounds) are accumulated chronologically;
  unscored sessions have no accuracy until a scored decision exists.
- `src/session-store.ts`: IndexedDB active-session/history store. Read/compare/write
  mutations happen in a single transaction across tabs. Promises resolve only
  after commit, never merely after an individual write request succeeds.
- `src/App.tsx`: approved React interface, dialogs, settings, and keyboard/touch
  interaction. It renders masked snapshots rather than reading engine internals.

Each mutation restores a detached candidate from the last committed checkpoint,
checks its session ID/revision, applies the action, and commits the new state.
Failed validation, draws, or writes leave the saved session unchanged. The UI
never automatically replays an uncertain choice: it reloads committed state and
shows the error. Session IDs also prevent stale tabs acting on a different new
session whose numeric revision happens to match.

The old fetch adapter and Python browser-test server have been removed. There
are no production test endpoints, fixture query parameters, or window hooks.

## Rule presets

Setup and session settings offer four six-deck presets combining stand/hit soft
17 with/without late surrender. Each replaces all eight rule fields, including
shuffle threshold and split rules; practice, feedback, bankroll, and wager are
unchanged. Expand Table rules to customize. The displayed preset is inferred from
all rule values; unmatched settings show Custom rules. Only concrete rules are
saved, so existing checkpoints/backups need no migration. Presets do not claim
casino-specific rules or expected returns, and do not add single-deck tables.
Active-session changes still require confirmation before archiving/replacement.

## Mastery exercises

`src/Mastery.tsx` offers an optional hard → soft → pair → missed → all practice
path from the top-toolbar Mastery exercises button. `src/session-mastery.ts` derives a live goal from exact
session counters: at least 20 scored decisions and 90% accuracy. Later hits and
splits count; correction retries and delayed feedback retain existing scoring.
The goal can become unmet again as accuracy changes. It is not a persistent
badge, lifetime proficiency measure, or per-opening coverage claim.

Exercise selection requires explicit confirmation before the existing atomic
session reset/archive operation. Rules, bet, bankroll setting, and feedback mode
are preserved; a chart target is removed. Frequently missed retains its existing
saved/current-opening-mistake behavior and all-hands fallback. No new save schema
or storage key is needed: progress is recomputed on load/backup restore. Clearing
history does not reset the active session goal.

## Timed practice

The header toolbar beside Hand practice / Simulation offers Start timed practice,
which opens the shared accessible modal with a labeled 1-/3-/5-minute duration
selector and the scoring explanation. Cancel leaves practice unchanged; submitting
starts the timer and closes setup. Active/finished timer status, results, and
pause/resume/finish controls use a separate compact bar below the toolbar,
keeping the main button row aligned. There is no separate timed-practice or Your focus sidebar panel;
Mastery exercises is also available from the top toolbar.
`src/TimedPractice.tsx` owns the UI-only timer and scored-decision deltas;
`src/timed-practice.ts` supplies elapsed-time, pause, and result helpers.
Elapsed time uses a monotonic clock, not interval counts. Dialogs, errors,
loading, and hidden tabs pause the timer; resuming is explicit. Time includes
next-hand/dealing and feedback, so decisions/minute is throughput, not average
reaction latency. Finishing early or reaching zero freezes the challenge results
without blocking actions, ending the session, or changing engine scoring.

Only successful action commits while running contribute scored-decision deltas.
Illegal/failed actions and Next do not count. Delayed feedback contributes when
scores are released, which can include choices made before starting or while
paused; unfinished delayed choices are absent. Correction retries follow the
existing engine's scoring. Accuracy is unavailable with zero scored decisions.
Results reset on refresh, session replacement/end, or starting a new challenge;
there is no persistence, backup, history, or save-schema change. Other tabs'
choices are not live-synced into challenge results. Untimed practice is unchanged.

Unit tests cover durations, elapsed-time clamping, pause/resume, and summaries.
`tests/timed-practice.spec.ts` covers scoring, timer expiry, manual/dialog pauses,
saved-state isolation, refresh reset, early finish, narrow/large-text reflow,
and accessibility; it is configured for all four browser projects.

## Advanced practice

The header’s **Advanced practice** button opens `src/AdvancedPractice.tsx` before
or during practice without replacing, scoring, or modifying the active session.
Advanced quiz scores and settings live only in the overlay and reset on close;
there is no save-schema, backup, or history change. Expected value opens the
separate full-page Simulation mode instead of another overlay exercise.

- Running count reveals ten cards one at a time from a separate fresh shuffled
  single deck, starting at zero. Checking unlocks a per-card Hi-Lo tag/cumulative
  count review. Reveals are self-paced; previous cards are hidden until review.
- True-count conversion supplies a running count (−20 to +20) and decks remaining
  (0.5–6 in half-deck increments). Divide and floor toward negative infinity,
  including negative counts. This does not test deck estimation. Both counting
  drills score each question once, retain separate scores across exercise changes,
  and reset on overlay close. Helpers live in `src/counting-practice.ts`, UI in
  `src/CountingPractice.tsx`; neither touches the active shoe or storage.
- Bet sizing uses a configurable nondecreasing five-bucket ramp (TC ≤0, 1, 2, 3,
  ≥4), 1–100 whole base units. Counts are floored toward negative infinity before
  bucket lookup. This is a drill, not an optimized betting recommendation.
- Deviation practice covers four hard non-pair stand/hit openings: 16 vs 10 at
  TC 0, 15 vs 10 at +4, 12 vs 3 at +2, and 12 vs 2 at +3. Fixed six-deck S17,
  no surrender; stand at/above index, hit below. Source: [Wizard of Odds Hi-Lo](https://wizardofodds.com/games/blackjack/card-counting/high-low/),
  which attributes these indices to Don Schlesinger. This is not a full index
  system and never alters the ordinary basic-strategy recommendation engine.
- EV prediction/simulation (in Simulation mode) compares basic-flat, basic-ramp, and always-stand-flat
  play using the existing game/strategy engine in `src/advanced.worker.ts`.
  `src/advanced-practice.ts` supplies validated bounded workloads, reproducible
  seeds, Hi-Lo/ramp helpers, independent 50-round blocks, and block-mean normal
  95% intervals. Each run uses 20–200 blocks per strategy (1,000–10,000 rounds).
  Cancellation or leaving Simulation mode terminates the worker. Worker assets are
  included in production precaching and the aggregate JavaScript build budget.

Simulation defaults: six decks, S17, 3:2, DAS, three splits, re-split aces, one
card on split aces, no surrender. The full-page workspace configures 2/4/6/8
decks, S17/H17, surrender, DAS, split limits/ace rules, and 50–90% penetration.
Strategy follows the selected S17/H17, surrender, and DAS rules using multi-deck
tables (not deck-specific optimal tables). No insurance, deviations, wonging, or
bankroll limits. Shuffle before a round at the remaining-card threshold, with a
minimum reserve of 52 cards. All dealt cards, including unused hole cards, are
revealed after settlement for the next pre-bet Hi-Lo count. Decks remaining are
exact, not estimated. Each block starts with a fresh shoe/count. Strategies share
block seeds but may consume different cards; intervals are not paired-difference
tests. Results are net base units per initial round, including splits/doubles,
not return per unit wagered, exact EV, or risk of ruin. Ramp play has different
exposure/variance. Short Monte Carlo runs may be noisy; no profitability claim.

`App.tsx` defaults to Hand practice and replaces its main content in Simulation
mode, preserving saved practice and suppressing gameplay shortcuts. Timed
challenges pause and require manual resume. Desktop simulation uses a wide grid;
mobile stacks the controls. Simulation settings/results are temporary and reset
on leaving the mode. No storage/backup schema changes are needed.
`tests/simulation-mode.spec.ts` covers custom rules, saved-hand isolation,
keyboard isolation, desktop width, accessibility, narrow/large-text reflow,
and the default mode after refresh.

Tests: `src/advanced-practice.test.ts` and `tests/advanced.spec.ts` cover ramp/index
boundaries, deterministic simulation, flat-ramp equivalence, uncertainty,
score-once behavior, saved-session isolation, worker results/cancellation, focus,
narrow reflow, and WCAG scans. Browser coverage is configured for all four projects.

## Chart drills

Select a strategy-chart cell during practice, then confirm replacement to start
an opening-hand drill. `Config.practice = "targeted"` requires a strictly validated
`target` (kind, player value, dealer upcard). Other modes omit that optional field;
old saves remain unchanged. Checkpoints, history JSON, and backups retain targets.
The visible target is also included in history/review. Rules, wager, and feedback
mode are inherited; session scores and bankroll restart normally.

Targets use the chart's representative two-card values: hard totals use 2 plus
(total − 2) below 12 and 10 plus (total − 10) otherwise; soft rows use ace plus
the other card, pairs use equal values. Ten includes face cards. This avoids
substituting a splittable pair for a hard-total drill with different guidance.
The existing filtered-deal path discards nonmatching candidates without scoring
or settlement, preserves real physical shoes/RNG, and excludes natural-blackjack
rounds with no player decision. Feedback, later hits/splits, and scoring follow
the current rules. Filtered outcomes are practice data, not return estimates.
Chart buttons support touch, Enter, arrow keys, and Home/End with one tab stop
per chart; Back to chart restores the selected cell's focus.

## Browser storage

Database: `blackjack-studio`; object store: `sessions`; active key: `active`.
The version-1 envelope stores an ID, revision, and a validated version-1 trainer
checkpoint. Checkpoints include current physical cards/shoe, RNG state, config,
feedback, pending decisions, scores/counters, and the settlement-recorded flag.
The database version stays at 1, so deployed active saves need no destructive
upgrade. Additional keys in the same store hold version-1 history metadata
(`history`, including the active review journal) and individual immutable session
archives (`history:<session ID>`). Ordinary choices update only active state and
its bounded journal, not the whole archive. Ending/replacing a session writes its
archive and deletes/replaces active state in the same transaction. History reads
use one consistent read-only transaction across metadata and archives.

Each archive retains full session counters/settings, timestamps, ending reason,
settled bankroll/profit, and up to 200 recent rounds. Reviews include dealer/player
cards, outcomes, split-hand indices, chosen/recommended actions, explanations,
correction retries, and whether each choice was scored. Illegal choices are not
counted as decisions. Delayed choices in abandoned rounds remain unscored, with
the dealer hole card masked. Active journals are never returned by the history
presentation API; pending recommendations cannot leak into active play.
Cumulative accuracy uses total correct / total decisions, best streak is the
maximum session streak, and profit excludes unsettled rounds. Totals include
ended/replaced sessions only; whole-session counters survive review retention.

Pre-history active saves still restore unchanged, and their full counters enter
history when ended. Only the current and subsequent rounds can be reviewed;
partial coverage and unknown start times are labeled rather than fabricated.

Schemas bound/validate cards, ranks/values, counters, settings, round structure,
settlements, and delayed-feedback state before hydration. Future versions are
rejected conservatively instead of overwritten. Corrupt/unsupported data remains
untouched until explicit recovery: **Discard saved session** affects the active
record, while confirmed **Delete saved history** removes archives and repairs
unreadable history metadata without changing active hands or scores. If metadata
is valid, history deletion also preserves the current review journal.
Storage failures are visible; there is no silent unsaved-memory fallback.

Browser/profile/origin boundaries apply: localhost ports and the published site
have separate saves. Clearing site data, browser eviction, or private browsing
can lose data. No server expiry, cookie, cloud sync, or automatic old-server
session migration exists. Multiple tabs share an active save but do not receive
push updates; reload/the next operation reconciles active state. Use **Refresh
history** to see archives added by another tab. Ending a session archives it and
deletes only its active record, not the database or earlier history records.

Checkpoints contain hidden cards/internal recommendations because the entire
engine runs locally. Only presentation snapshots mask these fields. This is a
practice app, not an anti-cheating or real-money gambling system.

## Tests

```sh
npm run test:unit --prefix frontend
npm run format:check --prefix frontend
cd frontend
npx playwright install --with-deps chromium firefox webkit
npm test
```

Vitest runs engine/controller tests under Node, with `fake-indexeddb` testing real
IndexedDB transaction behavior. Reference comparisons use checked-in Python
fixtures without needing Python. Snapshot/restore is checked at each reference
trainer frame, as are future RNG/shuffle continuity, pending delayed feedback,
stale/duplicate tabs, save aborts, recovery, and validation boundaries.

Playwright builds the production app and serves `dist/` on port 8765 using Vite
preview. Tests exercise real browser gameplay/storage, refresh, keyboard focus,
overlays, settings confirmation, feedback modes, splits/surrender, mobile and
compact desktop layouts, storage errors/recovery, offline gameplay/reload/fresh
opening, and a real repository-subpath static mount with scoped service-worker,
manifest/icons, and deferred-update checks. Test code seeds browser entropy; it does
not replace the engine or depend on a backend. The five-card layout case uses an
explicitly authored valid storage fixture, not a production fixture hook.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can point to an installed Chromium binary.
Screenshots/traces are in `test-results/` and the HTML report is in
`playwright-report/` (both ignored). CI retains them even on successful runs.
Version 1.0 is owner-accepted with no outstanding release blockers. See the
[release record](RELEASE.md) for verification evidence and explicitly waived
manual device/accessibility checks.
CI runs Node/browser tests
using Node only. Frozen reference fingerprints and coverage counts are checked
in the unit suite; no generator or Python environment is needed. See
[fixture provenance](src/engine/fixtures/README.md) before changing a baseline.

## Design and limits

The slate/mint design retains larger desktop cards and text. Wide screens at
least 1280px and up to 1100px high use side-by-side hands and a keyboard-focusable
scrolling statistics sidebar. Three-to-five-card hands fan without shrinking
ranks; larger split groups/unusually long hands can grow naturally instead of
being clipped. Tall desktops, tablets, and phones keep stacked hands.

Card arrivals/reveals, feedback changes, dialogs, and history charts use brief
presentation-only animations. They never delay actions or storage commits, and
are disabled when the browser requests reduced motion. Card animations preserve
the existing fan/layout transforms.

Google Fonts are optional; system fallbacks work without them. After successful
initial precaching, gameplay/charts and opening/reloading work offline. No
analytics are included.

Frequently missed practice snapshots archived `openingMisses` when starting or
replacing a session, including the session being replaced. Archives are read in
the same transaction as session creation, not on ordinary choices. Targets are
stored separately from scores in an optional checkpoint field; older saves still
restore unchanged. Current-session opening mistakes also become targets. Only
scored opening mistakes qualify, not abandoned delayed choices or later/split
hand decisions. Unreachable targets under current rules are ignored; an empty
pool falls back to all hands. Clearing history leaves active drill targets intact;
future sessions no longer use the deleted archives. Targets are not weighted by
mistake count and do not imply replaying exact cards or old recommendations.

Pages publishing, session history/review, and cross-session mistake drills are
implemented. Full JSON backup/restore and JSON/CSV history exports are available
in Saved history. Backups include active checkpoints/RNG, journals and all archives;
restore validates before atomically replacing all local data and assigns a fresh
active identity to reject stale-tab actions. Restore does not merge; download a
backup first and reload other tabs afterward. Files are limited to 25 MiB on
import. History JSON is a review report, while CSV contains ended-session
summaries (accuracy as a fraction, settled profit); neither is a restore format.
CSV text fields are quoted and spreadsheet-formula prefixes neutralized.
Initial bet-sizing, selected Hi-Lo deviation, and EV prediction/simulation
exercises are available in Advanced practice (see above). Remaining feature work
includes expanded progression, more indices, and optional saved
advanced progress. Follow-up
verification includes latest-feature WebKit/mobile Safari, real-device,
screen-reader, and performance coverage; Chromium/Firefox automation covers the
current advanced exercises.

CI and Pages use Ubuntu 24.04 with Node-24-compatible action releases. Build/test
commands explicitly use Node 22; action runtimes are separate from that toolchain.
Live deployment is restricted to `master`.
