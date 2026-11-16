# Blackjack Studio

A browser-based blackjack basic-strategy trainer built with **React, TypeScript,
and Vite**. Practice hands, learn from feedback, explore strategy charts, and
review your progress. Everything runs on your device—no account or server required.

**[Open Blackjack Studio](https://ctmay4.github.io/blackjack-analysis/)**

The responsive interface supports desktop and mobile, keyboard and touch controls,
large cards and text, and offline use.

## Run locally

Use Node.js 20.19+ or 22.12+:

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

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| **H** / **S** / **D** / **P** / **R** | Hit / stand / double / split / surrender when enabled |
| **Enter** | Next hand |
| **T** | Strategy chart |
| **V** | Statistics |
| **?** | Help |
| **Q** | Session summary; press again to end and archive the session |
| **Esc** | Cancel summary and return to practice |

### Basic-strategy practice

- Practice all, hard, soft, pair, surrender, or frequently missed opening hands.
- **Timed practice** in the practice sidebar offers optional 1-, 3-, and 5-minute
  challenges with scored decisions, accuracy, and decisions per active minute.
  Pause/resume or finish early; dialogs and hidden tabs pause automatically and
  require manual resume. The timer ending does not stop or replace practice.
  Timer results are temporary (not saved, backed up, or restored on refresh).
  Speed includes dealing and feedback time. Scores count when committed while
  the timer runs; delayed feedback can include choices made before starting or
  while paused. Normal correction-mode scoring still applies.
- Choose immediate feedback, require-correction, or delayed feedback.
- Open **Your focus → Mastery exercises** for a session goal of at least 20 scored
  decisions with at least 90% accuracy. Exercises cover hard hands, soft hands,
  pairs, frequently missed hands, and mixed practice. Goals survive refresh and
  backup restore; they are not permanent badges or proof of full chart coverage.
- In the **Strategy chart**, select a cell and confirm **Chart drill** to repeat
  a representative two-card hand against that dealer upcard. The target survives
  refresh and backup restore. Select another cell to change targets, or change
  Practice focus in settings to leave the drill. Use Tab to reach a chart cell,
  arrow keys to move, Home/End within a row, and Enter to select.
- **Frequently missed** targets opening-hand mistakes from saved sessions and
  current practice. Targets are selected when starting or replacing a session;
  without usable mistakes, practice falls back to all hands.
- **Rule preset** offers four six-deck combinations: stand/hit soft 17, with or
  without late surrender. Expand **Table rules** to customize deck count, DAS,
  split limits, re-splitting aces, and one-card split aces.
- Changing settings or starting an exercise requires confirmation before
  archiving and replacing the current session.

Strategy tables target multi-deck play; changing the deck count does not select a
single-deck strategy table. Blackjack pays 3:2; split 21 is not a natural.
“Ideal” means the selected basic-strategy table, without count-based deviations.
Virtual money only; bankroll does not restrict legal wagers. Filtered deals are
for practice, not profit estimation.

### Advanced practice

Open **Advanced practice** (∑ in the header) for:

- **Hi-Lo running count:** count ten self-paced cards, then review each tag and
  cumulative count.
- **True-count conversion:** divide a supplied running count by remaining decks
  in half-deck increments, flooring toward negative infinity.
- **Bet sizing:** practice configurable bet ramps.
- **Deviations:** practice four selected Hi-Lo stand/hit indices.
- **Expected value:** prediction and simulation exercises comparing flat/ramped
  basic strategy with flat always-stand play.

Advanced exercises do not affect basic-strategy sessions or saved scores. Their
scores and settings reset when the overlay closes. Simulations run in a
cancellable Web Worker using six-deck S17 rules and report net base units per
initial round with approximate 95% intervals. Full assumptions appear in the
overlay; results are not exact EV or guaranteed profit.

## Session saving and privacy

The active session is saved automatically in **IndexedDB**, including the shoe,
hands, statistics, pending feedback, and random-generator state. Refresh resumes
that session without re-scoring choices or changing future shuffles.

- **Saved history** contains ended or replaced sessions, cumulative statistics,
  accuracy/profit charts, and mistake reviews. Each session retains its latest
  **200 rounds** for review; statistics cover the whole session. Ended sessions
  cannot be resumed.
- Cumulative accuracy is weighted by decisions and excludes active sessions.
  Unfinished rounds do not count toward settled outcomes or profit; pending
  delayed-feedback choices appear as unscored in review.
- **Saved history → Backup and export** provides full JSON backup/restore and
  JSON/CSV reports. Restore validates the backup (maximum 25 MiB), then replaces
  local practice and history after confirmation—it does not merge. Download a
  current backup first and reload other open tabs afterward. Report exports are
  not restorable backups.
- Data stays in this browser/profile and site origin. Different ports, hostnames,
  and the published site have separate saves. Backups can transfer progress to
  another device, but there is no automatic cross-device synchronization.
- Tabs share the active session, with transaction and revision checks preventing
  duplicate choices. Reload or the next action reconciles changes; there is no
  live push sync.
- Clearing site data, browser eviction, or leaving private browsing can remove
  saves. Installation is not a backup.
- Storage failures are reported. Corrupt or unsupported-version data is preserved
  until you explicitly discard it. History deletion requires confirmation and
  leaves active practice intact.

Saved state and backup files contain hidden cards: this is a practice tool, not a
secure gambling system. Keep backups private. No analytics are included. Google
Fonts optionally load online; system-font fallbacks work offline.

## Offline use and installation

Open the published site online once and wait for **Ready for offline use on this
device**. You can then reopen the same URL offline for practice, charts, and local
history.

Installation is optional: use your browser's **Install app** option, or Safari's
**Share → Add to Home Screen** on iPhone/iPad. Availability varies by browser.

Updates offer **Reload to update** or **Later** without automatically interrupting
practice. Applying an update reloads open app tabs and restores committed practice.

Offline features require HTTPS (or localhost) and a production build. To test
locally, build and run `npm run preview --prefix frontend`; offline features are
disabled in the Vite development server.

## Deployment

The app is a static site with relative asset paths and can be hosted under a
repository subpath. GitHub Pages automation is in `.github/workflows/pages.yml`.

1. In **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Push to `master`, or manually run the Pages workflow on `master`.
3. The workflow checks formatting, unit tests, browser tests, and build-size
   budgets, then deploys `frontend/dist/`.

Feature branches and pull requests run CI without publishing the live site.

## Tests

```sh
npm run test:unit --prefix frontend
cd frontend
npx playwright install --with-deps chromium firefox webkit
npm test
```

`npm test` builds the app, starts a local static preview server, and runs browser
tests. Coverage includes game rules, strategy recommendations, session persistence,
backup/restore, cross-browser behavior, accessibility, and responsive layouts.

## Upcoming features

- Expanded progression exercises.
- More Hi-Lo deviation drills beyond the initial four stand/hit indices.
- Potential additions: saved advanced-practice progress, more simulation rules,
  and risk-of-ruin analysis.
