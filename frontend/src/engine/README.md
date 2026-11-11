# TypeScript blackjack engine

This is the browser-independent domain foundation for the all-TypeScript web
trainer. It does not depend on React, FastAPI, browser storage, or the DOM.
**This is now the authoritative engine used by the playable browser app.**
The UI uses a browser-local controller and IndexedDB, not HTTP or Python.
The retired Python stack and fixture generators have been removed. Frozen JSON
baselines retain independent regression evidence; their sources are archived in
Git history (see [fixture provenance](fixtures/README.md)).

## Implemented

- `types.ts`: shared card/action/rule contracts, validated rule defaults,
  discriminated active/completed round states, and outcomes.
- `cards.ts`: physical cards, multi-ace evaluation, explicit test shoes,
  Fisher–Yates shuffle, and an injectable deterministic JS random source.
- `game.ts`: hit/stand/double/split/surrender, hand progression, H17/S17,
  split limits/aces, naturals, dealer play, and settlement.
- `strategy.ts`: original annotated tables, legality-aware fallbacks, H17/S17,
  surrender/DAS configuration, and explanatory recommendations.
- `trainer.ts`: accuracy/streaks/categories, mistakes, bankroll and outcomes,
  practice filters, immediate/correction/delayed feedback, snapshots, and charts.
- `session-types.ts` / `session-config.ts`: shared presentation contracts and
  strict runtime settings validation with detached six-deck web defaults.
- `checkpoint.ts`: versioned, bounded runtime validation for restoring cards,
  rounds, counters, feedback, pending choices, and settlement state. The old
  fetch adapter is gone; the UI uses the engine's shared types directly.

Shoes draw from the **end** of the supplied array, matching the Python fixtures.
Equal numeric seeds do **not** promise identical Python and JS shuffles. Use
explicit shoes for cross-language comparisons. Default engine rules retain
Python's eight decks; the current web setup explicitly selects six.

Game operations are atomic: illegal actions and exhausted-shoe failures leave
the state and shoe unchanged. This brings the Python web adapter's rollback
behavior into the domain engine instead of depending on a server wrapper.
A game is not a trainer: it exposes the dealer hole card internally. Only use
`TrainerSession.snapshot()` for presentation: it masks that card and dealer
total until settlement, and never exposes a live recommendation before a choice.
Delayed feedback scores pending choices only at round completion; snapshots keep
previous-round scores visible without leaking the new round's correctness.
Snapshots, settings, charts, and returned feedback are detached from internal state.

The session scores played choices only after successful engine actions, so shoe
exhaustion cannot leave a partially scored decision. Failed next-round filtering
restores the previous completed round, shoe, and checkpointable RNG state;
skipped deals never settle or spend bankroll. A filter searches at most 10,000
openings. The default seeded random source has serializable state. Arbitrary
injected random functions remain useful for tests, but cannot be checkpointed.

`TrainerSession.checkpoint()` produces a detached internal version-1 save;
`TrainerSession.restore(unknown)` validates and hydrates it without dealing a
new hand or recording settlement again. The saved shoe, generator state, pending
delayed decisions, and counters continue exactly after refresh. A checkpoint
contains hidden cards/hints for the local engine; never render it directly.
Use only `snapshot()` for presentation. Restore checkpoints from supported
formats only, not through object assignment into the live game.

## Verification

```sh
npm run test:unit --prefix frontend
npm run build --prefix frontend
```

Routine tests need only Node. The committed reference fixture covers:

- **68,480 strategy decisions:** every two-card value combination and dealer
  upcard, plus multi-card/ace/bust samples, under 64 combinations of H17/S17,
  surrender, DAS, first-turn, doubling, and splitting eligibility.
- **175 game traces:** deterministic targeted scenarios plus 160 seeded physical
  shoes. Every step compares cards, active hand, legal actions, finished flags,
  bets, split counts, remaining shoe size, dealer behavior, and settlements.
- **93 trainer traces / 618 frames:** targeted edge cases plus 72 three-round
  sessions across all feedback modes. Compare full presentation snapshots,
  feedback/explanations, hidden scoring counters, remaining shoe size, and charts.
  Every frame is also JSON-serialized and restored before continuing.
- Independent tests for privacy, snapshot isolation, practice targeting, failed
  draws/filter rollback, cards/shuffle validation, and ace-rule edge cases.

The fixtures are deliberately not included in the production browser bundle.
They were generated from the original implementation during migration, not from
the TypeScript implementation under test. They are now frozen: unit tests check
their SHA-256 fingerprints and coverage counts rather than regenerating them.
Git attributes preserve LF line endings across platforms, and Prettier ignores
these JSON files. See [fixture provenance](fixtures/README.md) for the source
commit, scope, and fingerprints.

The strategy tables retain their original source attribution and are checked
byte-for-byte against the frozen reference tables. Don't change an expected
result simply to make a failing comparison pass; justify and independently test
intentional behavior changes.

### Intentional differences from the legacy game

Two ace restrictions were incorrect in the Python baseline and are explicitly
corrected in the new implementation:

1. Turning off **re-splitting** aces must not forbid the **initial** A/A split.
2. With one-card split aces, a newly drawn A/A pair may still be re-split when
   enabled and below the split limit. Its only player choices are split/stand;
   hit/double remain unavailable. Otherwise the ace hand finishes automatically.

Reference fixtures compare shared behavior, not those legacy bugs. Random
oracle cases use unrestricted split-ace draws; dedicated TypeScript assertions
cover the corrected restrictions. These corrections **are active in the browser
app**. Finite wager/rule validation and engine-local rollback also intentionally
strengthen direct engine calls. The opening strategy chart
now correctly permits the initial A/A split when only re-splitting is disabled.
Settings reject impossible pair practice with zero allowed splits immediately,
rather than dealing 10,000 unmatched hands. Strict JSON-boundary validation also
rejects unknown fields, nonfinite numbers, coerced string amounts, and non-plain objects.

## Next milestones

Pages deployment and browser-local session history/review are complete. History
is an application-layer concern (`../session-history.ts`), not part of trainer
checkpoints; engine fixtures and active-save formats remain unchanged.

Next: export/import backups, cross-session mistake drills, and, if useful,
Web Worker simulations.
