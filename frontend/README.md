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
The root README describes enabling and deploying GitHub Pages. No API URL or
server-specific environment variables are required.

## Architecture

- `src/engine/`: pure TypeScript game, strategy, trainer, settings, presentation
  contracts, and validated versioned checkpoints. See [engine notes](src/engine/README.md).
- `src/session-controller.ts`: typed load/start/reset/choose/end/chart operations;
  owns session IDs, revisions, entropy, and lifecycle, not blackjack decisions.
- `src/session-store.ts`: IndexedDB active-session store. Read/compare/write
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

## Browser storage

Database: `blackjack-studio`; object store: `sessions`; active key: `active`.
The version-1 envelope stores an ID, revision, and a validated version-1 trainer
checkpoint. Checkpoints include current physical cards/shoe, RNG state, config,
feedback, pending decisions, scores/counters, and the settlement-recorded flag.
This is not a hand-history database yet.

Schemas bound/validate cards, ranks/values, counters, settings, round structure,
settlements, and delayed-feedback state before hydration. Future versions are
rejected conservatively instead of overwritten. Corrupt/unsupported data remains
untouched until the explicit **Discard saved session** recovery confirmation.
Storage failures are visible; there is no silent unsaved-memory fallback.

Browser/profile/origin boundaries apply: localhost ports and the published site
have separate saves. Clearing site data, browser eviction, or private browsing
can lose data. No server expiry, cookie, cloud sync, or automatic old-server
session migration exists. Multiple tabs share an active save but do not receive
push updates; reload/the next operation reconciles it. Ending a session deletes
only its active record, not the database or future history records.

Checkpoints contain hidden cards/internal recommendations because the entire
engine runs locally. Only presentation snapshots mask these fields. This is a
practice app, not an anti-cheating or real-money gambling system.

## Tests

```sh
npm run test:unit --prefix frontend
npm run format:check --prefix frontend
cd frontend
npx playwright install chromium
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
compact desktop layouts, storage errors/recovery, offline gameplay after load,
and a repository-subpath static mount. Test code seeds browser entropy; it does
not replace the engine or depend on a backend. The five-card layout case uses an
explicitly authored valid storage fixture, not a production fixture hook.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can point to an installed Chromium binary.
Screenshots/traces are in `test-results/` (ignored). CI runs Node/browser tests
using Node only. Frozen reference fingerprints and coverage counts are checked
in the unit suite; no generator or Python environment is needed. See
[fixture provenance](src/engine/fixtures/README.md) before changing a baseline.

## Design and limits

The slate/mint design retains larger desktop cards and text. Wide screens at
least 1280px and up to 1100px high use side-by-side hands and a keyboard-focusable
scrolling statistics sidebar. Three-to-five-card hands fan without shrinking
ranks; larger split groups/unusually long hands can grow naturally instead of
being clipped. Tall desktops, tablets, and phones keep stacked hands.

Google Fonts are optional; system fallbacks work without them. Gameplay/chart
operations work offline after the app loads, but offline opening/reloading isn't
guaranteed until a service worker/PWA is added. No analytics are included.

Remaining work: publish the prepared Pages workflow, add history/review/export/import,
and expand Safari/Firefox, screen-reader, device, and performance coverage.
