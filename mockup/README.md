# Web trainer design preview

The archived, approved visual mockup. No dependencies, API, storage, or real game logic. The live React/TypeScript trainer is in `frontend/`; see the [root README](../README.md).

## Open

Open `mockup/index.html` directly in a modern browser. No server or Python installation is needed for this static reference.

## Explore

- Use **Scene** in the top preview bar to switch between a decision, mistake feedback, split hands, and a completed round.
- Action buttons and shortcuts switch fixed fixtures only; they do not calculate an outcome. The resulting scene may show different cards.
- Open settings, the strategy-chart excerpt, progress, and help. Settings are illustrative and do not update fixtures.
- Resize the browser to compare desktop and mobile layouts.
- Keyboard: H/S/D/P for available actions, Enter for next hand, T for the chart, ? for help, Escape to dismiss overlays.

Fonts load from Google Fonts when online; local system-font fallbacks work offline. All other assets are local. Native dialogs require a modern browser.

## Original design review checklist

- Does the dark slate / mint direction feel right?
- Are cards, hand totals, and the active split hand easy to read?
- Is feedback noticeable without overpowering the table?
- Is the sidebar useful, or too busy?
- Are mobile actions comfortable and secondary tools easy to find?

This original mockup stacks mobile statistics below the table. The live application has since added an above-table stats strip and height-aware desktop layouts.
