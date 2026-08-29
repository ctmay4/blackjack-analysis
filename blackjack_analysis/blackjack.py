import argparse
import random
import time
from dataclasses import dataclass
from statistics import mean, pstdev

from .strategy import Decision, Hand, Strategy, StrategyType


INITIAL_MONEY = 100_000.0


def generate_deck():
    """Return one 52-card deck; aces are represented by 11."""
    return ([10] * 4 + list(range(2, 10)) + [11]) * 4


def generate_dealer_deck(decks=8, rng=None):
    if decks < 1:
        raise ValueError("decks must be at least 1")
    cards = generate_deck() * decks
    (rng or random).shuffle(cards)
    return cards


def card_value(card):
    if 2 <= card <= 6:
        return 1
    if card in (10, 11):
        return -1
    return 0


def true_count(cards):
    if not cards:
        raise ValueError("cannot count an empty shoe")
    # int() matches Kotlin's truncation toward zero for integer division.
    return int(-sum(map(card_value, cards)) * 52 / len(cards))


def get_bet_size(count, bankroll):
    betting_unit = bankroll / 1000
    return min(1000.0, max(25.0, betting_unit * (count - 1)))


@dataclass(frozen=True)
class Rules:
    decks: int = 8
    penetration: float = 0.25
    dealer_hits_soft_17: bool = False
    allow_surrender: bool = False
    double_after_split: bool = True
    max_splits: int = 3
    resplit_aces: bool = True
    one_card_on_split_aces: bool = True

    def __post_init__(self):
        if self.decks < 1:
            raise ValueError("decks must be at least 1")
        if not 0 < self.penetration < 1:
            raise ValueError("penetration must be between 0 and 1")
        if self.max_splits < 0:
            raise ValueError("max_splits cannot be negative")


@dataclass(frozen=True)
class SimulationResult:
    profit: float
    final_bankroll: float
    rounds: int
    hands: int
    wins: int
    losses: int
    pushes: int
    surrenders: int
    blackjacks: int
    total_bet: float


@dataclass(frozen=True)
class AggregateResult:
    simulations: int
    average_profit: float
    average_final_bankroll: float
    rounds: int
    hands: int
    wins: int
    losses: int
    pushes: int
    surrenders: int
    blackjacks: int
    total_bet: float
    min_final_bankroll: float
    max_final_bankroll: float
    profit_stddev: float

    @property
    def win_rate(self):
        return self.wins / self.hands if self.hands else 0.0

    @property
    def loss_rate(self):
        return self.losses / self.hands if self.hands else 0.0

    @property
    def push_rate(self):
        return self.pushes / self.hands if self.hands else 0.0

    @property
    def average_bet(self):
        return self.total_bet / self.hands if self.hands else 0.0


def simulate(
    strategy_type=StrategyType.STANDS_ON_SOFT_17,
    rules=None,
    bankroll=INITIAL_MONEY,
    rng=None,
    shoe=None,
):
    """Simulate one shoe and return its complete result."""
    if bankroll <= 0:
        raise ValueError("bankroll must be positive")
    if rules is None:
        rules = Rules(dealer_hits_soft_17=strategy_type is StrategyType.HITS_ON_SOFT_17)
    strategy = Strategy(
        strategy_type,
        allow_surrender=rules.allow_surrender,
        double_after_split=rules.double_after_split,
    )
    cards = list(shoe) if shoe is not None else generate_dealer_deck(rules.decks, rng)
    shuffle_point = len(cards) * rules.penetration
    bankroll_value = bankroll
    counts = {
        "rounds": 0,
        "hands": 0,
        "wins": 0,
        "losses": 0,
        "pushes": 0,
        "surrenders": 0,
        "blackjacks": 0,
        "total_bet": 0.0,
    }

    def draw():
        if not cards:
            raise RuntimeError("shoe ran out of cards")
        return cards.pop()

    while len(cards) > shuffle_point:
        dealer_up_card = draw()
        initial_hand = Hand.from_cards((draw(), draw()))
        initial_bet = get_bet_size(true_count(cards), bankroll_value)
        dealer_hand = Hand.from_cards((dealer_up_card, draw()))
        counts["rounds"] += 1

        # Check a natural dealer blackjack before allowing doubles or splits.
        if dealer_hand.blackjack:
            counts["hands"] += 1
            counts["total_bet"] += initial_bet
            if initial_hand.blackjack:
                counts["blackjacks"] += 1
                counts["pushes"] += 1
            else:
                counts["losses"] += 1
                bankroll_value -= initial_bet
            continue

        def play_from(player_hand, bet, first_turn, split_hand, splits_used):
            can_split = (
                player_hand.can_split
                and splits_used < rules.max_splits
                and (rules.resplit_aces or player_hand.cards[0] != 11)
            )
            can_double = len(player_hand.cards) == 2 and (
                not split_hand or rules.double_after_split
            )
            decision = strategy.decide(
                dealer_up_card,
                player_hand,
                first_turn=first_turn,
                can_double=can_double,
                can_split=can_split,
            )
            if decision is Decision.STAND:
                return [(bet, player_hand, split_hand)]
            if decision is Decision.DOUBLE:
                return play_from(player_hand + draw(), bet * 2, False, split_hand, splits_used)
            if decision is Decision.HIT:
                return play_from(player_hand + draw(), bet, False, split_hand, splits_used)
            if decision is Decision.SPLIT:
                hands = []
                for card in player_hand.cards:
                    new_hand = Hand.from_cards((card, draw()))
                    if rules.one_card_on_split_aces and card == 11:
                        hands.append((bet, new_hand, True))
                    else:
                        hands.extend(play_from(new_hand, bet, False, True, splits_used + 1))
                return hands
            if decision is Decision.SURRENDER:
                return [(bet, Hand.from_cards(()), split_hand)]
            raise ValueError(f"Unknown decision: {decision}")

        bets_and_hands = play_from(initial_hand, initial_bet, True, False, 0)

        while dealer_hand.total < 17 or (
            dealer_hand.total == 17 and dealer_hand.soft and rules.dealer_hits_soft_17
        ):
            dealer_hand = dealer_hand + draw()

        for bet, player_hand, split_hand in bets_and_hands:
            counts["hands"] += 1
            counts["total_bet"] += bet
            if not player_hand.cards:
                bankroll_value -= bet * 0.5
                counts["surrenders"] += 1
            elif player_hand.blackjack and not split_hand:
                counts["blackjacks"] += 1
                if dealer_hand.blackjack:
                    counts["pushes"] += 1
                else:
                    bankroll_value += bet * 1.5
                    counts["wins"] += 1
            elif player_hand.bust:
                bankroll_value -= bet
                counts["losses"] += 1
            elif dealer_hand.bust:
                bankroll_value += bet
                counts["wins"] += 1
            elif dealer_hand.total > player_hand.total:
                bankroll_value -= bet
                counts["losses"] += 1
            elif dealer_hand.total < player_hand.total:
                bankroll_value += bet
                counts["wins"] += 1
            else:
                counts["pushes"] += 1

    return SimulationResult(
        profit=bankroll_value - bankroll,
        final_bankroll=bankroll_value,
        **counts,
    )


def run_simulations(
    simulations=10_000,
    strategy_type=StrategyType.STANDS_ON_SOFT_17,
    rules=None,
    bankroll=INITIAL_MONEY,
    seed=None,
    progress=None,
):
    if simulations < 1:
        raise ValueError("simulations must be at least 1")
    rng = random.Random(seed)
    results = []
    for completed in range(1, simulations + 1):
        result = simulate(strategy_type, rules, bankroll, rng)
        results.append(result)
        if progress is not None:
            progress(completed, result)
    return AggregateResult(
        simulations=simulations,
        average_profit=mean(result.profit for result in results),
        average_final_bankroll=mean(result.final_bankroll for result in results),
        rounds=sum(result.rounds for result in results),
        hands=sum(result.hands for result in results),
        wins=sum(result.wins for result in results),
        losses=sum(result.losses for result in results),
        pushes=sum(result.pushes for result in results),
        surrenders=sum(result.surrenders for result in results),
        blackjacks=sum(result.blackjacks for result in results),
        total_bet=sum(result.total_bet for result in results),
        min_final_bankroll=min(result.final_bankroll for result in results),
        max_final_bankroll=max(result.final_bankroll for result in results),
        profit_stddev=pstdev(result.profit for result in results),
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulations", type=int, default=10_000)
    parser.add_argument(
        "--strategy",
        choices=[strategy.value for strategy in StrategyType],
        default=StrategyType.STANDS_ON_SOFT_17.value,
    )
    parser.add_argument("--decks", type=int, default=8)
    parser.add_argument("--penetration", type=float, default=0.25)
    parser.add_argument("--bankroll", type=float, default=INITIAL_MONEY)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--surrender", action="store_true")
    parser.add_argument("--no-double-after-split", action="store_true")
    parser.add_argument("--max-splits", type=int, default=3)
    parser.add_argument("--no-resplit-aces", action="store_true")
    parser.add_argument("--allow-more-than-one-card-on-split-aces", action="store_true")
    parser.add_argument("--tui", action="store_true", help="show live simulation progress")
    args = parser.parse_args(argv)

    strategy_type = StrategyType(args.strategy)
    rules = Rules(
        decks=args.decks,
        penetration=args.penetration,
        dealer_hits_soft_17=strategy_type is StrategyType.HITS_ON_SOFT_17,
        allow_surrender=args.surrender,
        double_after_split=not args.no_double_after_split,
        max_splits=args.max_splits,
        resplit_aces=not args.no_resplit_aces,
        one_card_on_split_aces=not args.allow_more_than_one_card_on_split_aces,
    )
    started = time.perf_counter()
    progress = None
    display = None
    if args.tui:
        from .tui import ProgressDisplay

        display = ProgressDisplay(args.simulations, args.bankroll)
        progress = display.update
    result = run_simulations(
        args.simulations, strategy_type, rules, args.bankroll, args.seed, progress
    )
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    if display is not None:
        display.finish(result)
        return

    print(f"Average profit: ${result.average_profit:,.2f}")
    print(f"Average final bankroll: ${result.average_final_bankroll:,.2f}")
    print(f"Final bankroll range: ${result.min_final_bankroll:,.2f} - ${result.max_final_bankroll:,.2f}")
    print(f"Profit standard deviation: ${result.profit_stddev:,.2f}")
    print(f"Hands: {result.hands:,}  Wins: {result.wins:,}  Losses: {result.losses:,}  Pushes: {result.pushes:,}")
    print(f"Surrenders: {result.surrenders:,}  Blackjacks: {result.blackjacks:,}")
    print(f"Win rate: {result.win_rate:.2%}  Loss rate: {result.loss_rate:.2%}  Push rate: {result.push_rate:.2%}")
    print(f"Average bet: ${result.average_bet:,.2f}")
    print(f"Finished in {elapsed_ms}ms")


if __name__ == "__main__":
    main()
