# Release hardening and sign-off

## Repeatable checks

Use the lockfile and the supported Node version (CI uses Node 22):

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run format:check
npm run test:unit
npm test
npm run check:build
npm run bench
npm audit --omit=dev
```

Run these from `frontend/`. `npm test` builds the production static site first.
For a machine with only Chromium installed, use
`npm run build && npx playwright test --project=chromium`; this is **not** full
release sign-off. A custom `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` affects only
Chromium, never Firefox or WebKit.

### Automated matrix

- Chromium: the complete browser suite, including offline/PWA and scoped updates.
- Firefox and desktop WebKit: gameplay, feedback modes, split/surrender, saving,
  concurrent tabs, failed writes, backup/restore, history, and release checks.
- iPhone 13 WebKit emulation: release accessibility, modal keyboard handling,
  narrow/large-text layout, duplicate-click protection, and screenshot checks.
- axe WCAG 2 A/AA and 2.1 AA scans: setup, active practice, chart, settings, empty
  history, help, progress, and summary. Populated history/charts/review are also
  scanned except on Firefox (see known verification gaps).
- A seeded 800-round stress test varies decks/rules and immediate/delayed feedback,
  compares checkpoint restoration after every choice and next shuffle, and checks
  settlement totals. This supplements, not replaces, independent frozen fixtures.

The release screenshot test captures 390px, 768px, and 1440px practice views with
reduced motion. These are **review artifacts, not visual-regression baselines**.
Review the HTML report with `npx playwright show-report`; CI and Pages retain the
report, screenshots, and failure traces for seven days, including successful runs.
The 320px test also enlarges the root font to 200%; it does not simulate browser
zoom or replace real zoom/device checks.

### Performance

`check:build` caps the aggregate gzip size of bundled JavaScript at 150 KiB and
CSS at 16 KiB. It fails for missing assets, too. This is a deterministic build-size
gate, not a network or interaction-speed measurement.

`bench` measures checkpoint validation/restoration, masked snapshots, and 100
rounds with recommendations/checkpoint round trips. Timings are advisory rather
than CI speed gates. Initial local Node 24 baseline: approximately 0.15 ms per
restore, 0.0024 ms per snapshot, and 31 ms per 100-round workload. Hardware,
Node, and background load affect these figures; compare on the same machine.

## Verification record and known gaps

- Local unit suite: 468 tests, including the stress workload.
- Baseline CI verified on 2026-11-13 at `00e24b9`: [run 43431265954](https://github.com/ctmay4/blackjack-analysis/actions/runs/43431265954)
  passed 107 browser tests with one known Firefox audit skipped. This includes
  desktop WebKit and iPhone 13 WebKit emulation. The Pages workflow also passed
  at that commit. These results do not cover subsequent working-tree changes.
- Local follow-up: 468 unit tests and 82 Chromium/Firefox browser tests pass,
  with the same Firefox audit skipped. Production build and formatting pass.
  Added isolated-profile backup transfer (archives, exact state, future play),
  multi-tab deferred updates (reload, committed scores, retained history), and
  forced-colors keyboard/focus checks. Forced colors revealed an intrusive table
  watermark and missing card boundaries in Firefox; CSS now hides the watermark
  and gives cards explicit system-color borders in that mode.
- Reviewed all nine baseline practice screenshots: 390/768/1440px in Chromium,
  desktop WebKit, and iPhone-emulated WebKit. No obvious clipping/overlap;
  narrow layouts stack and scroll, desktop shows hands side by side. This is a
  visual review of practice views, not a real-device or all-state certification.
- WebKit browser binaries download locally, but this development host lacks its
  shared libraries and passwordless sudo. A local full-matrix attempt passed
  78 tests and skipped one; 29 WebKit tests could not launch. Baseline CI above
  supplies WebKit evidence; the new tests/CSS still need an Ubuntu CI run.
- Forced-colors emulation runs on Chromium/Firefox only; its new test is explicitly
  skipped on WebKit, which does not emulate that media feature. Actual OS high
  contrast and assistive technology checks remain manual.
- Playwright Firefox 159 reproducibly crashes during axe analysis of populated
  SVG history, even with color-contrast disabled and when run alone. That one
  audit test is explicitly skipped on Firefox; equivalent Chromium audits and
  Firefox functional history tests remain enabled. Resolve/retest with a future
  browser/tool update. No accessibility rules are disabled in enabled audits.
- Dependency audit reports six build-tool findings (two low, four moderate) in
  the Workbox/PWA transitive tree. There are no production dependency findings.
  npm's proposed fix is a major PWA-plugin downgrade, not a safe patch. Do not use
  `npm audit fix --force`; track upstream fixes and retest scoped/offline updates
  before changing that toolchain. No untrusted build configuration is accepted.

## Manual release checklist (not yet signed off)

- [x] Baseline CI passes Chromium, Firefox, desktop WebKit, and iPhone-emulated
      WebKit at `00e24b9` (linked above).
- [x] Review baseline desktop/tablet/phone practice screenshots (linked CI artifacts).
- [ ] Rerun the complete CI matrix and review artifacts after follow-up test/CSS changes.
- [ ] Real Safari on iPhone/iPad and Chrome on Android: portrait/landscape,
      touch actions, scrolling, install, offline relaunch, and deferred update.
- [ ] Real desktop Chrome/Firefox/Safari: 200%/400% browser zoom, text scaling,
      keyboard-only flow, visible focus, modal closure/return, and no lost controls.
- [ ] NVDA with Firefox/Chrome and VoiceOver with Safari: setup labels, card names,
      feedback announcements, dialog navigation, charts' exact-value table, review.
- [ ] OS reduced motion, high contrast/forced colors, and offline font fallback.
- [ ] Export a backup on one device and restore it on another; verify ongoing
      practice/history, cancellation, and privacy warnings.
- [ ] Stage an update with active practice in multiple tabs; defer then apply it,
      verify committed scores/history survive. Check installed-window behavior.
- [ ] Test the published repository-subpath URL, then tag/publish the initial release.

## Real-device / assistive-technology handoff

No physical iOS/Android devices, NVDA, or VoiceOver were available for this pass.
Record tester, date, OS/browser/AT versions, URL/commit, and result for each check;
do not substitute Playwright emulation for these steps.

1. On iOS Safari and Android Chrome, start practice, rotate both ways, exercise
   touch actions and scroll every overlay. Install via the platform UI, wait for
   offline readiness, close the app, disconnect, and relaunch the installed app.
   Play, view charts/history, reconnect, then check a deferred app update.
2. On desktop Chrome/Firefox/Safari, use actual browser zoom at 200% and 400%
   (not CSS zoom or text-only enlargement). Tab/Shift+Tab through setup, gameplay,
   and dialogs; check visible focus, Escape/return focus, scrollable charts, and
   that actions remain reachable without horizontal page scrolling.
3. With NVDA (Firefox/Chrome) and VoiceOver (Safari), navigate labels, card names,
   changing feedback, dialogs, history/review, and the charts' exact-value table.
   Verify meaningful announcements without exposing the hidden dealer card.
4. Toggle OS reduced motion and high contrast; block fonts/disconnect and verify
   fallback text. Inspect card boundaries, disabled actions, and focus visibility.
5. Export active practice plus at least one ended session; transfer the file to a
   second physical device. Cancel a restore first, then confirm replacement.
   Verify history, scores, ongoing practice, warnings, and persistence on relaunch.
6. With practice/history saved and two tabs plus an installed window open, stage
   a new build. Choose Later and continue playing; then apply the update. Confirm
   all windows reload without losing committed scores/history or replaying actions.

Automated axe checks cannot certify accessibility. Emulated WebKit is not real
Safari/iOS, and build budgets/engine benchmarks do not certify low-end device
responsiveness. These manual checks remain release work, not claimed completion.
