# Blackjack Studio

A browser-only blackjack basic-strategy trainer built with **React, TypeScript,
and Vite**. Gameplay, teaching, charts, statistics, and session saving all run on
your device. **No Python runtime, API server, account, or backend hosting is
required to use or build the app.**

The approved slate/mint interface includes responsive desktop/mobile layouts,
large cards and text, keyboard/touch controls, practice filters, feedback modes,
and session summaries. Wide, shorter screens use side-by-side hands to keep
cards, feedback, and actions visible together.

## Run locally

Node.js 20.19+ or 22.12+ is recommended:

```sh
npm ci --prefix frontend
npm run dev --prefix frontend
```

Open the Vite URL, normally **http://127.0.0.1:5173**.

To try the production static build:

```sh
npm run build --prefix frontend
npm run preview --prefix frontend
```

Open **http://127.0.0.1:4173**. The deployable site is `frontend/dist/`.
See [`frontend/README.md`](frontend/README.md) for architecture and testing.

## Controls and practice

- **H** hit, **S** stand, **D** double, **P** split, **R** surrender when enabled.
- **Enter** next hand; **T** strategy chart; **V** statistics; **?** help.
- **Q** summary, then **Q** again or **End session** to archive the active session.
  **Esc** cancels and returns to practice. Use the header's **Saved history** button
  to review ended/replaced sessions, cumulative statistics, and mistakes.
- Practice all, hard, soft, pair, surrender, or frequently missed opening hands.
- Choose immediate feedback, require-correction, or delayed feedback.
- **Frequently missed** drills opening-hand mistakes from saved sessions plus
  mistakes scored during current practice. Targets are selected when starting or
  replacing a session; new scores stay separate. Without usable mistakes, it
  falls back to all hands. Recommendations always follow the current rules.
- Changing settings requires confirmation before replacing the current session.

Virtual money only. Bankroll does not restrict legal wagers. “Ideal” means the
selected basic-strategy table; count-based deviations are not mixed into it.

## Session saving and privacy

The active session is saved in **IndexedDB**, including the shoe, current hands,
statistics, pending delayed feedback, and random-generator state. Refresh resumes
that exact session without re-scoring choices or changing future shuffles.

- Data stays in this browser/profile and site origin. Different local ports,
  hostnames, and the published Pages site have separate saves.
- Tabs share the active session. Atomic storage transactions, session IDs, and
  revision checks prevent stale/double choices from being applied twice. Reload
  or the next action reconciles changes from another tab; there is no push sync.
- Ending or replacing a session atomically archives its statistics, settings,
  settled profit, and recent hands before clearing/replacing its active save.
  History includes all ended sessions; each keeps its latest **200 rounds** for
  read-only review, while statistics cover the whole session. Ended sessions
  cannot be resumed. Previous Python-server sessions are not imported.
- Cumulative accuracy is weighted by decisions; active-session scores are excluded
  until the session ends. Unfinished rounds do not count as settled outcomes or
  profit. Pending delayed-feedback choices are marked unscored in review.
- Existing saves resume unchanged. Their full scores are retained, but earlier
  choices cannot be reconstructed; review labels this partial coverage. History
  deletion requires confirmation and keeps active practice intact.
- Use **Saved history → Download backup** to save active practice and all history
  as JSON. **Restore backup** validates the file (maximum 25 MiB), then atomically
  replaces local practice/history after confirmation; it does not merge. Download
  a current backup first. Reload other open tabs after restoring.
- History JSON exports include retained reviews; CSV exports contain ended-session
  summaries with exact accuracy fractions and settled profit. These are reports,
  not restorable backups. Backup files include hidden cards; keep them private.
- Clearing site data, browser eviction, or leaving private browsing can remove
  saves. Downloaded backups can be restored on another device/origin, but there
  is no cloud backup or automatic cross-device synchronization.
- Storage failures are reported rather than silently pretending progress was
  saved. Corrupt/future-version data is preserved until you explicitly discard it.
- After the first online visit finishes offline setup, opening/reloading the app,
  gameplay, charts, and local history work offline. Cached app files and saved
  sessions can still be removed by browser eviction or clearing site data.

The public UI snapshot masks the dealer hole card and pending teaching hints.
The saved state contains the full local game: this is a practice tool, not a
secure gambling or anti-cheating system. Google Fonts optionally load online;
system-font fallbacks work without them. No analytics are included.

## Offline use and installation

Open the published site online once and wait for **Ready for offline use on this
device**. You can then reopen the same URL without a connection. Installation is
optional: use your browser's **Install app** option, or Safari's **Share → Add to
Home Screen** on iPhone/iPad. Availability and wording vary by browser.

Updates download when online and offer **Reload to update** or **Later**; they
do not automatically interrupt practice. Applying an update reloads open app tabs
and restores committed practice from IndexedDB. Installation is not a backup:
data remains local to this browser/profile and origin.

Offline/PWA features require HTTPS (or localhost) and a production build; they
are disabled in the Vite development server. To test locally, build and use
`npm run preview --prefix frontend`.

## GitHub Pages

The app is a static site and uses relative asset paths, including home navigation,
so it works under the published repository URL:

**https://ctmay4.github.io/blackjack-analysis/**

Deployment automation is in `.github/workflows/pages.yml`. For a fresh deployment:

1. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Push the changes to `master`, or manually run the Pages workflow on `master`.
3. The workflow installs Node dependencies, checks formatting/unit tests, runs
   cross-browser tests and build-size checks against the static build, and deploys
   only `frontend/dist/`.

The site becomes available after a successful **Deploy browser trainer to GitHub
Pages** workflow run. Check the repository's **Actions** tab for deployment status.
No Python, API URL, deployment secrets, or external backend is used by the site.
Both workflows pin Ubuntu 24.04 and use Node-24-compatible GitHub Actions; the
application build/test toolchain remains Node 22. Feature branches and pull
requests run CI without publishing the live site.

## Tests

```sh
npm run test:unit --prefix frontend
cd frontend
npx playwright install --with-deps chromium firefox webkit
npm test
```

`npm test` builds the app, starts a local static preview server, and runs browser
tests. Neither test suite requires Python. The unit suite includes comparisons
against **175 Python game traces, 68,480 strategy decisions, and 93 trainer traces
(618 frames)**. Reference trainer states are also saved/restored at each step.
See [engine migration notes](frontend/src/engine/README.md) for coverage and the
intentional split-ace corrections.

## Migration status

1. **Game and strategy port — complete:** pure TypeScript rules/settlement,
   deterministic shoes, validation, original tables, recommendations, and tests.
2. **Teaching/session port — complete:** accuracy, streaks, categories, mistakes,
   bankroll, practice filters, feedback modes, masked snapshots, and charts.
3. **Browser-only cutover — complete:** typed local controller replaces HTTP;
   versioned validated saves restore sessions/RNG; browser tests use no Python.
4. **Static hosting — complete:** standalone Vite output, repository-subpath
   coverage, and automatic GitHub Pages deployment from `master`.
5. **Legacy cleanup — complete:** Python/FastAPI, terminal UI/CLI, Python tests,
   packaging/lockfile, and temporary oracle generators have been removed.
   Application development, tests, CI, and deployment are now Node-only.

TypeScript is the sole application implementation. Frozen JSON fixtures retain
independent migration evidence, with provenance and integrity checks documented
in [`frontend/src/engine/fixtures/README.md`](frontend/src/engine/fixtures/README.md).
The retired source remains in Git history, not as a second maintained engine.
The original visual mockup remains in `mockup/`.

## Next milestones

Presentation-only animations and historical cumulative-accuracy/settled-profit
charts are implemented, with reduced-motion support and an accessible exact-value
table for the charts.

Full JSON backup/restore and JSON/CSV history exports are implemented in
**Saved history → Backup and export**.

Remaining work:

- Separate count/true-count, bet-sizing, deviation, timed, progression, rule-preset,
  and expected-value exercises. Browser simulations, if retained, use Web Workers.
- Complete the real-device/screen-reader checks and initial release sign-off in
  [`frontend/RELEASE.md`](frontend/RELEASE.md). Automated release hardening now
  includes cross-browser projects, WCAG scans, large-text/reflow and duplicate-click
  checks, long-session checkpoint stress coverage, build-size budgets, benchmarks,
  and screenshot artifacts. Baseline CI passed desktop/iPhone-emulated WebKit,
  and responsive practice screenshots have been reviewed. Follow-up checks cover
  isolated-profile backup transfer, multi-tab updates, and forced colors; those
  changes still need full CI verification. Real-device/assistive-technology checks
  and the documented Firefox audit gap remain; release sign-off is not complete.

Strategy tables target multi-deck play; a deck setting does not imply a dedicated
single-deck strategy table. Blackjack pays 3:2; split 21 is not a natural. H17/S17,
surrender, DAS, split limits, re-splitting aces, and one-card split aces are configurable.
