# blackjack-analysis

Python simulation for comparing blackjack basic strategies.

## Run

No installation is required; the project uses only the Python standard library:

```sh
python3 -m blackjack_analysis --simulations 10000 --strategy stand_soft_17 --seed 42
```

Useful options include:

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

The output includes average profit, average and range of final bankrolls,
profit standard deviation, wins, losses, pushes, surrenders, blackjacks, rates,
average bet, and elapsed time.

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
python3 -m unittest discover -s tests -v
```

The strategy files in `blackjack_analysis/resources/` contain the
split/soft/hard lookup tables. Their dealer columns are 2 through ace, where
ace is represented by 11.
