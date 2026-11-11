# Frozen migration baselines

These JSON files are **historical expected results**, not live data or inputs to
the production app. Keep them unchanged so the TypeScript implementation keeps
an independent regression baseline after retiring Python.

## Provenance

The results were generated from the Python implementation at commit
[`61a6bab8f993cdfac175d8c212825339bceeb48a`](https://github.com/ctmay4/blackjack-analysis/tree/61a6bab8f993cdfac175d8c212825339bceeb48a/blackjack_analysis),
before the TypeScript cutover. The original rules, trainer, tables, and tests
remain in Git history; they are no longer part of the application checkout.

For example, inspect the original sources without restoring the old stack:

```sh
git show 61a6bab8f993cdfac175d8c212825339bceeb48a:blackjack_analysis/game.py
git show 61a6bab8f993cdfac175d8c212825339bceeb48a:blackjack_analysis/trainer.py
```

The temporary `generate_engine_fixtures.py` and `generate_trainer_fixtures.py`
scripts have been retired along with Python. A historical generator path in
fixture metadata describes how that baseline was originally produced; it is
not an available command. **Do not regenerate expectations from the new engine.**

## Coverage

- `python-reference.json`: original annotated strategy tables, 107 player-hand
  samples × 10 dealer upcards × 64 strategy configurations = **68,480 decisions**.
  Includes **175 game traces**: 15 targeted cases and 160 shuffled physical shoes.
- `python-trainer-reference.json`: **93 trainer traces / 618 frames**: 21 targeted
  cases and 72 three-round sessions, across immediate/correction/delayed modes.
  Includes settings, charts, private scoring counters, feedback, and public
  snapshots. Reference tests also serialize and restore each trainer frame.

Every trace records the explicit shoe, rules, actions, and expected states.
Draw order is from the end of the supplied array. Python/JavaScript numeric
seeds do not imply identical shuffles. Random game/trainer traces avoid the
legacy split-ace restrictions that were intentionally corrected; independent
TypeScript tests cover those corrections (see the parent engine README).

The datasets were checked for identical output under Python 3.10 and 3.13 during
migration. Routine tests and CI now need **Node only**.

## Integrity

SHA-256 of the original UTF-8 files, including their final LF newline:

| File                            | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `python-reference.json`         | `7d681873ea10cfd0ae6c891b385e369bd4ddb787ffa0c461d6d0026475ee27c2` |
| `python-trainer-reference.json` | `9df577bd224bc7bc7cb640439ae41e1958f34b3ee7a6758619a90831aa2e476a` |

`provenance.test.ts` checks these fingerprints and coverage counts. Git attributes
pin the JSON baselines to LF for consistent cross-platform checkouts; Prettier
leaves them alone. They are not included in the deployed Vite bundle.

For an intentional rule change, add independently justified tests and document
any parity exception instead of editing a frozen expected result merely to
make a failing comparison pass.
