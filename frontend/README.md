# Blackjack Studio web trainer

Local-first React + TypeScript frontend; FastAPI is an adapter around the existing
`TrainerSession`, not a second blackjack engine. `mockup/` remains the original
static design reference. No accounts or persistence are included.

## Run the built application

From the repository root:

```sh
uv sync --extra web
npm ci --prefix frontend
npm run build --prefix frontend
uv run --extra web python -m blackjack_analysis web
```

Visit http://127.0.0.1:8000. The generated build lives in
`blackjack_analysis/web_static/` (ignored by Git and included as package data
when built before packaging). Python serves the API and compiled UI in one
process. The `web` extra is optional; the terminal trainer and simulator retain
their existing dependencies and commands.

## Develop

Run the Python server as above. In a second terminal:

```sh
npm run dev --prefix frontend
```

Open the Vite URL (normally http://127.0.0.1:5173). Vite proxies `/api` to
127.0.0.1:8000 without changing the original host, keeping cookies and requests
same-origin. The Python API runs without needing a frontend build during
Vite development.

## Tests

From the repository root:

```sh
uv sync --extra web --extra test
uv run --extra web --extra test python -m unittest discover -s tests -v
npm run build --prefix frontend
cd frontend
npx playwright install chromium
npm test
```

Playwright starts a separate server on port 8765. That test-only wrapper seeds
the real Python engine for repeatability; production has no fixture endpoints
or client-controlled shoes. Tests cover gameplay, settlement, refresh resume,
keyboard focus, overlays, settings confirmation, correction and delayed modes,
splits, surrender, mobile overflow, and stale-request reconciliation.

`BLACKJACK_TEST_PYTHON` may name a Python executable with web dependencies.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` may name an already-installed Chromium
binary. By default tests use `uv run --extra web python` and Playwright's browser.
Generated screenshots and traces are in `test-results/` and are not tracked.
API tests skip when the optional web/test dependencies aren't installed.

## HTTP contract

All responses use `Cache-Control: no-store`. Mutation requests send JSON and
`X-Trainer-Request: 1`; cross-origin requests and unrecognized hosts are rejected.
No CORS wildcard is enabled. The host allowlist, loopback binding, and same-origin
checks are local-use safeguards, not a public-hosting/authentication solution.

- `POST /api/session`: validated configuration, creates a session and sets an
  opaque HttpOnly, SameSite=Strict cookie. Returns a snapshot at revision 0.
- `GET /api/session`: returns the current snapshot; 404 for missing/expired sessions.
- `PUT /api/session`: `{revision, config}`, replaces the session after the UI's
  explicit confirmation. Preserves monotonic revisions, resets training statistics.
- `DELETE /api/session`: `{revision}`, ends the session, removes it from memory,
  and clears the browser cookie. Returns JSON `null`. Press Q to open the summary,
  then Q again (or End session) to confirm; Escape cancels without clearing anything.
- `POST /api/action`: `{revision, action}`. Action is hit/stand/double/split/surrender
  or next. Returns the new snapshot. Engine failures roll back the operation.
- `GET /api/chart`: hard, soft, and pair reference decisions from the configured
  Python strategy. Opening a chart is an explicit learning aid in every mode.

Snapshots contain configuration, masked dealer cards, player hands, legal
actions, structured feedback, completed-round outcomes/profit, and statistics.
They never include a live recommendation before a choice; delayed mode does
not expose current-round accuracy or recommendations before settlement.
A completed round may contain no training decisions (natural blackjack).

A lock serializes session access and revision checks. A repeated/stale mutation
returns 409 rather than executing twice. The UI never automatically retries an
uncertain mutation: it reloads authoritative state and shows an error instead.
Illegal choices are handled by `TrainerSession` and do not count as decisions.
Next-round requests before settlement return 422.

Sessions are bounded to 128 per process, expire after 12 idle hours, and disappear
on server restart. Browser cookies renew on successful API access; clearing the
cookie loses access to that session. Use one server process: workers do not share
sessions. Multiple tabs in one browser share a cookie and synchronize through
revision conflicts rather than push notifications.

## Design and limitations

The approved slate/mint design is retained with responsive cards, an active
split-hand outline, a desktop statistics sidebar, a compact mobile stats strip,
and native accessible dialogs. On wide viewports (at least 1280px) up to 1100px
high, dealer and player hands sit side by side, with tighter header spacing and
an independently scrollable, keyboard-focusable statistics sidebar. Common
three-to-five-card hands fan without shrinking cards or covering rank corners.
Larger split groups and unusually long hands can still grow the table naturally;
no gameplay is clipped to force a fixed viewport. Taller desktops, tablets, and
phones retain the stacked layout. Browser tests check primary controls at
1440×900, 1920×1080, and 1280×800, including settlement and split-hand examples.

Fonts optionally load from Google Fonts with system-font fallbacks; all other
application assets are local.

No historical chart is fabricated: the mockup's sample sparkline is replaced
by a neutral accuracy emblem until real historical data exists. Animations,
durable history/export, WebSockets, public deployment, and advanced training
remain outside this pass. Automated browser coverage is Chromium only; further
Safari/Firefox, screen-reader, and device testing is still worthwhile.
