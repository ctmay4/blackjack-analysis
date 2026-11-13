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
- Local Chromium and Firefox browser run: 78 passed, one explicitly skipped
  Firefox audit (below). Formatting, production build, size budgets, and production
  dependency audit pass. WebKit is tracked separately from these results.
- WebKit browser binaries download locally, but this development host lacks its
  shared libraries and passwordless sudo. Desktop/iPhone WebKit must pass the
  Ubuntu CI matrix before publishing. They have **not** been verified locally.
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

- [ ] CI passes Chromium, Firefox, desktop WebKit, and iPhone-emulated WebKit.
- [ ] Review desktop/tablet/phone screenshots and failed-test traces, if any.
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

Automated axe checks cannot certify accessibility. Emulated WebKit is not real
Safari/iOS, and build budgets/engine benchmarks do not certify low-end device
responsiveness. These manual checks remain release work, not claimed completion.
