# blackjack-analysis

Python simulation for comparing blackjack basic strategies.

## Basic-strategy trainer

Install dependencies and launch the interactive trainer with `uv`:

```sh
uv sync
uv run python -m blackjack_analysis train
```

Alternatively, environments with `pip` can use `python3 -m pip install -e .`
followed by `python3 -m blackjack_analysis train`.

Training starts with a $1,000 bankroll and a $25 wager per round. Set these
independently with `train --bankroll 2500 --bet 50`; use `train --help` for
the available table rules. The older `--train` form still works and retains
its original $100,000 default bankroll.

The trainer uses `h` to hit, `s` to stand, `d` to double, `p` to split,
`r` to surrender when enabled, `Enter` for the next round, and `q` to quit.
Letter shortcuts also accept uppercase input.
It immediately identifies non-basic-strategy choices, plays the selected move,
and keeps decision accuracy, streak, outcome, and bankroll statistics. “Ideal”
means the selected basic-strategy table; count-based deviations are not modeled.

Press `?` for help, `t` for a strategy chart based on the selected rules, and
`v` for an accuracy breakdown and frequently missed situations. Press `q` to
see the end-of-session summary; `Esc` returns to practice or `q` again quits.
The chart shows two-card decisions; subsequent hits can change the best move.

Target opening hands with `--practice hard|soft|pair|surrender|missed` (default:
`all`). Surrender practice requires `--surrender`. Missed-situation practice
starts with ordinary hands until you miss an opening decision, then targets
matching opening situations. Skipped deals do not affect your bankroll or statistics.
Use `--require-correction` to retry a wrong choice before playing it, or
`--delayed-feedback` to hide accuracy and recommendations until the round ends.
These two feedback modes cannot be combined. For example:

```sh
uv run python -m blackjack_analysis train --practice soft --delayed-feedback
uv run python -m blackjack_analysis train --practice surrender --surrender --require-correction
```

## Run simulations

After installation, run the simulator with:

```sh
python3 -m blackjack_analysis simulate --simulations 10000 --strategy stand_soft_17 --seed 42
```

Add `--tui` for a live terminal dashboard with progress and outcome counts:

```sh
python3 -m blackjack_analysis simulate --simulations 10000 --seed 42 --tui
```

The existing command without `simulate` remains supported. Simulation defaults
to 10,000 shoes and a $100,000 starting bankroll. Useful options include:

- `--strategy stand_soft_17|hit_soft_17`
- `--decks N`
- `--penetration FRACTION` (the shoe is reshuffled after this fraction remains)
- `--bankroll AMOUNT`
- `--seed N`
- `--surrender`
- `--no-double-after-split`
- `--max-splits N`
- `--no-resplit-aces`
- `--allow-more-than-one-card-on-split-aces`
- `--tui`
- `train --bet AMOUNT` (fixed wager for each training round)

The final output includes average profit, average and range of final bankrolls,
profit distribution percentiles, standard deviation, wins, losses, pushes,
surrenders, blackjacks, bust rates, average initial and resolved-hand wagers,
return on wager, drawdown, action counts, and elapsed time. The TUI additionally
shows live confidence intervals, ETA, betting/counting ranges, profitable-shoe
rate, normalized profit, risk metrics, and a fixed-milestone convergence
sparkline.

## Rules modeled

- Eight decks by default, with Hi-Lo-style card counting and bets from $25 to
  $1,000.
- Dealer stands on soft 17 for `stand_soft_17` and hits on soft 17 for
  `hit_soft_17`.
- Blackjack pays 3:2 and pushes against a dealer blackjack.
- Surrender, double-after-split, split limits, re-splitting aces, and
  one-card split aces are configurable.
- A split 21 is a regular 21, not a natural blackjack.

## Test

```sh
uv run python -m unittest discover -s tests -v
```

The strategy files in `blackjack_analysis/resources/` contain the
split/soft/hard lookup tables. Their dealer columns are 2 through ace, where
ace is represented by 11.

## Roadmap

### 1. Shared blackjack engine — complete

- Physical cards with ranks and suits
- Seedable multi-deck shoe and deterministic test shoes
- Step-driven dealer, player, and split-hand state
- Hit, stand, double, split, and surrender
- Natural blackjack, settlement, H17/S17, and configurable table rules

### 2. Simulator migration — complete

- Batch simulation and training use the same game engine
- Existing simulation APIs, statistics, seeds, and progress dashboard remain supported
- Doubling correctly draws exactly one card and ends the hand

### 3. Teaching and statistics layer — complete

- Compare each legal choice with the configured basic-strategy table
- Explain the recommendation and still execute an incorrect legal choice
- Reject illegal actions without affecting accuracy
- Track accuracy, streaks, hand categories, mistakes, outcomes, and bankroll
- Produce JSON-friendly session snapshots for other frontends

### 4. Interactive TUI — complete

- Colored Unicode cards and a hidden dealer hole card
- Active split-hand indication and responsive narrow-terminal layout
- Immediate feedback and running session statistics
- Single-key controls for every action

### 5. CLI restructuring — complete

- Add explicit `train` and `simulate` subcommands
- Preserve current invocations for backward compatibility
- Give training and simulation separate defaults
- Add configurable training wagers and command-level tests

### 6. Trainer usability — complete

- Add a help screen, strategy-chart overlay, and end-of-session summary
- Show accuracy breakdowns and frequently missed situations
- Add optional require-correction and delayed-feedback modes
- Add practice filters for hard hands, soft hands, pairs, surrender, and missed situations

### 7. Persistence and review

- Store training history locally using versioned JSON or SQLite data
- Resume cumulative statistics and review recent hands
- Generate drills from frequently missed situations
- Export session results as JSON or CSV

### 8. Web frontend

- Reuse `TrainerSession`; do not duplicate blackjack rules in JavaScript
- Expose cards, actions, feedback, and statistics through an HTTP or WebSocket API
- Build a responsive, accessible interface with keyboard and touch controls
- Add optional animations, charts, and mobile layouts

### 9. Advanced training modes

- Running-count and true-count drills
- Bet-sizing practice
- Count-based strategy deviations
- Timed exercises, difficulty progression, and casino-rule presets
- Expected-value comparisons between actions

These modes should remain separate from basic strategy so that “ideal” always
has an unambiguous meaning.

### 10. Quality and release

- Benchmark and optimize the shared engine
- Expand split, resplit, and shoe-exhaustion edge-case coverage
- Test terminal behavior on Linux, macOS, and Windows
- Add formatting, linting, continuous integration, and packaged console commands
- Add screenshots and publish an initial release
