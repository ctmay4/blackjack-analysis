# Web trainer design preview

A standalone, responsive visual mockup. No dependencies, API, storage, or real game logic. The Python trainer is unchanged.

## Open

Open `index.html` directly in a modern browser, or from the repository root run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory mockup
```

Visit http://localhost:8000.

## Explore

- Use **Scene** in the top preview bar to switch between a decision, mistake feedback, split hands, and a completed round.
- Action buttons and shortcuts switch fixed fixtures only; they do not calculate an outcome. The resulting scene may show different cards.
- Open settings, the strategy-chart excerpt, progress, and help. Settings are illustrative and do not update fixtures.
- Resize the browser to compare desktop and mobile layouts.
- Keyboard: H/S/D/P for available actions, Enter for next hand, T for the chart, ? for help, Escape to dismiss overlays.

Fonts load from Google Fonts when online; local system-font fallbacks work offline. All other assets are local. Native dialogs require a modern browser.

## Feedback to collect

- Does the dark slate / mint direction feel right?
- Are cards, hand totals, and the active split hand easy to read?
- Is feedback noticeable without overpowering the table?
- Is the sidebar useful, or too busy?
- Are mobile actions comfortable and secondary tools easy to find?

Mobile currently stacks statistics below the table. A compact above-table stats strip is a possible next iteration after reviewing the first layout.
