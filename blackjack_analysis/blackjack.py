import argparse
import random
import sys
import time
from dataclasses import dataclass
from statistics import mean, pstdev

from .game import BlackjackGame, Outcome, Rules, Shoe
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


def percentile(values, fraction):
    """Return a linearly interpolated percentile from a non-empty sequence."""
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


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
    min_bet: float = 0.0
    max_bet: float = 0.0
    raised_bets: int = 0
    min_count: int = 0
    max_count: int = 0
    initial_bet_total: float = 0.0
    min_initial_bet: float = 0.0
    max_initial_bet: float = 0.0
    count_total: int = 0
    hits: int = 0
    stands: int = 0
    doubles: int = 0
    splits: int = 0
    player_busts: int = 0
    dealer_busts: int = 0
    dealer_blackjacks: int = 0
    dealer_resolved_rounds: int = 0
    min_bankroll: float = 0.0
    max_drawdown: float = 0.0

    @property
    def resolved_hands(self):
        return self.hands - self.surrenders

    @property
    def win_rate(self):
        return self.wins / self.resolved_hands if self.resolved_hands else 0.0

    @property
    def loss_rate(self):
        return self.losses / self.resolved_hands if self.resolved_hands else 0.0

    @property
    def push_rate(self):
        return self.pushes / self.resolved_hands if self.resolved_hands else 0.0

    @property
    def surrender_rate(self):
        return self.surrenders / self.hands if self.hands else 0.0


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
    min_bet: float = 0.0
    max_bet: float = 0.0
    raised_bets: int = 0
    min_count: int = 0
    max_count: int = 0
    initial_bet_total: float = 0.0
    min_initial_bet: float = 0.0
    max_initial_bet: float = 0.0
    count_total: int = 0
    hits: int = 0
    stands: int = 0
    doubles: int = 0
    splits: int = 0
    player_busts: int = 0
    dealer_busts: int = 0
    dealer_blackjacks: int = 0
    dealer_resolved_rounds: int = 0
    min_bankroll: float = 0.0
    max_drawdown: float = 0.0
    average_max_drawdown: float = 0.0
    profitable_simulations: int = 0
    losing_simulations: int = 0
    breakeven_simulations: int = 0
    profit_p05: float = 0.0
    profit_median: float = 0.0
    profit_p95: float = 0.0

    @property
    def resolved_hands(self):
        return self.hands - self.surrenders

    @property
    def win_rate(self):
        return self.wins / self.resolved_hands if self.resolved_hands else 0.0

    @property
    def loss_rate(self):
        return self.losses / self.resolved_hands if self.resolved_hands else 0.0

    @property
    def push_rate(self):
        return self.pushes / self.resolved_hands if self.resolved_hands else 0.0

    @property
    def surrender_rate(self):
        return self.surrenders / self.hands if self.hands else 0.0

    @property
    def blackjack_rate(self):
        return self.blackjacks / self.rounds if self.rounds else 0.0

    @property
    def player_bust_rate(self):
        return self.player_busts / self.hands if self.hands else 0.0

    @property
    def dealer_bust_rate(self):
        return self.dealer_busts / self.dealer_resolved_rounds if self.dealer_resolved_rounds else 0.0

    @property
    def average_bet(self):
        return self.total_bet / self.hands if self.hands else 0.0

    @property
    def average_initial_bet(self):
        return self.initial_bet_total / self.rounds if self.rounds else 0.0

    @property
    def average_count(self):
        return self.count_total / self.rounds if self.rounds else 0.0

    @property
    def return_on_wager(self):
        return self.average_profit * self.simulations / self.total_bet if self.total_bet else 0.0

    @property
    def profit_per_100_hands(self):
        return self.average_profit * 100 * self.simulations / self.hands if self.hands else 0.0

    @property
    def profit_per_100_rounds(self):
        return self.average_profit * 100 * self.simulations / self.rounds if self.rounds else 0.0


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
    game = BlackjackGame(rules, Shoe(cards), rng)
    shuffle_point = len(game.shoe) * rules.penetration
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
        "min_bet": None,
        "max_bet": 0.0,
        "raised_bets": 0,
        "min_count": None,
        "max_count": None,
        "initial_bet_total": 0.0,
        "min_initial_bet": None,
        "max_initial_bet": 0.0,
        "count_total": 0,
        "hits": 0,
        "stands": 0,
        "doubles": 0,
        "splits": 0,
        "player_busts": 0,
        "dealer_busts": 0,
        "dealer_blackjacks": 0,
        "dealer_resolved_rounds": 0,
        "min_bankroll": bankroll,
        "max_drawdown": 0.0,
    }
    peak_bankroll = bankroll

    def record_bet(bet):
        counts["total_bet"] += bet
        counts["min_bet"] = bet if counts["min_bet"] is None else min(counts["min_bet"], bet)
        counts["max_bet"] = max(counts["max_bet"], bet)

    def record_bankroll():
        nonlocal peak_bankroll
        peak_bankroll = max(peak_bankroll, bankroll_value)
        counts["min_bankroll"] = min(counts["min_bankroll"], bankroll_value)
        counts["max_drawdown"] = max(counts["max_drawdown"], peak_bankroll - bankroll_value)

    while len(game.shoe) > shuffle_point:
        # The wager is chosen before any cards from this round are exposed.
        count = true_count(game.shoe.values)
        initial_bet = get_bet_size(count, bankroll_value)
        counts["initial_bet_total"] += initial_bet
        counts["min_initial_bet"] = (
            initial_bet
            if counts["min_initial_bet"] is None
            else min(counts["min_initial_bet"], initial_bet)
        )
        counts["max_initial_bet"] = max(counts["max_initial_bet"], initial_bet)
        counts["raised_bets"] += initial_bet > 25.0
        counts["count_total"] += count
        counts["min_count"] = count if counts["min_count"] is None else min(counts["min_count"], count)
        counts["max_count"] = count if counts["max_count"] is None else max(counts["max_count"], count)
        counts["rounds"] += 1
        round_state = game.start_round(initial_bet)
        dealer_up_card = round_state.dealer_cards[0].value
        while round_state.result is None:
            player_hand = round_state.active_hand
            available = game.available_actions
            decision = strategy.decide(
                dealer_up_card,
                player_hand.strategy_hand,
                first_turn=player_hand.first_turn and not player_hand.split_hand,
                can_double=Decision.DOUBLE in available,
                can_split=Decision.SPLIT in available,
            )
            if decision is Decision.HIT:
                counts["hits"] += 1
            elif decision is Decision.STAND:
                counts["stands"] += 1
            elif decision is Decision.DOUBLE:
                counts["doubles"] += 1
            elif decision is Decision.SPLIT:
                counts["splits"] += 1
            game.apply(decision)

        result = round_state.result
        if result.dealer_blackjack:
            counts["dealer_blackjacks"] += 1
        needs_dealer_hand = any(
            hand.outcome is not Outcome.SURRENDER
            and not Hand.from_cards(card.value for card in hand.cards).bust
            and not (Hand.from_cards(card.value for card in hand.cards).blackjack and not hand.split_hand)
            for hand in result.hands
        )
        if result.dealer_blackjack or needs_dealer_hand:
            counts["dealer_resolved_rounds"] += 1
        if result.dealer_bust and needs_dealer_hand:
            counts["dealer_busts"] += 1

        for hand_result in result.hands:
            bet = hand_result.bet
            player_hand = Hand.from_cards(card.value for card in hand_result.cards)
            counts["hands"] += 1
            record_bet(bet)
            if hand_result.outcome is Outcome.SURRENDER:
                counts["surrenders"] += 1
            elif player_hand.blackjack and not hand_result.split_hand:
                counts["blackjacks"] += 1
            if player_hand.bust:
                counts["player_busts"] += 1
            if hand_result.outcome is Outcome.WIN:
                counts["wins"] += 1
            elif hand_result.outcome is Outcome.LOSS:
                counts["losses"] += 1
            elif hand_result.outcome is Outcome.PUSH:
                counts["pushes"] += 1
            bankroll_value += hand_result.profit
            record_bankroll()

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
    profits = [result.profit for result in results]
    return AggregateResult(
        simulations=simulations,
        average_profit=mean(profits),
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
        profit_stddev=pstdev(profits),
        min_bet=min(result.min_bet for result in results),
        max_bet=max(result.max_bet for result in results),
        raised_bets=sum(result.raised_bets for result in results),
        min_count=min(result.min_count for result in results),
        max_count=max(result.max_count for result in results),
        initial_bet_total=sum(result.initial_bet_total for result in results),
        min_initial_bet=min(result.min_initial_bet for result in results),
        max_initial_bet=max(result.max_initial_bet for result in results),
        count_total=sum(result.count_total for result in results),
        hits=sum(result.hits for result in results),
        stands=sum(result.stands for result in results),
        doubles=sum(result.doubles for result in results),
        splits=sum(result.splits for result in results),
        player_busts=sum(result.player_busts for result in results),
        dealer_busts=sum(result.dealer_busts for result in results),
        dealer_blackjacks=sum(result.dealer_blackjacks for result in results),
        dealer_resolved_rounds=sum(result.dealer_resolved_rounds for result in results),
        min_bankroll=min(result.min_bankroll for result in results),
        max_drawdown=max(result.max_drawdown for result in results),
        average_max_drawdown=mean(result.max_drawdown for result in results),
        profitable_simulations=sum(result.profit > 0 for result in results),
        losing_simulations=sum(result.profit < 0 for result in results),
        breakeven_simulations=sum(result.profit == 0 for result in results),
        profit_p05=percentile(profits, 0.05),
        profit_median=percentile(profits, 0.5),
        profit_p95=percentile(profits, 0.95),
    )


def _add_table_options(parser, bankroll):
    parser.add_argument(
        "--strategy",
        choices=[strategy.value for strategy in StrategyType],
        default=StrategyType.STANDS_ON_SOFT_17.value,
    )
    parser.add_argument("--decks", type=int, default=8)
    parser.add_argument("--penetration", type=float, default=0.25)
    parser.add_argument("--bankroll", type=float, default=bankroll)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--surrender", action="store_true")
    parser.add_argument("--no-double-after-split", action="store_true")
    parser.add_argument("--max-splits", type=int, default=3)
    parser.add_argument("--no-resplit-aces", action="store_true")
    parser.add_argument("--allow-more-than-one-card-on-split-aces", action="store_true")


def _add_practice_options(parser):
    parser.add_argument("--practice", choices=("all", "hard", "soft", "pair", "surrender", "missed"), default="all")
    feedback = parser.add_mutually_exclusive_group()
    feedback.add_argument("--require-correction", action="store_true", help="retry incorrect choices before playing")
    feedback.add_argument("--delayed-feedback", action="store_true", help="reveal mistakes when the round ends")


def _parse_cli(argv):
    if argv and argv[0] == "web":
        parser = argparse.ArgumentParser(description="Launch the local Blackjack Studio web trainer")
        parser.add_argument("command", choices=["web"])
        parser.add_argument("--port", type=int, default=8000)
        args = parser.parse_args(argv)
        if not 1 <= args.port <= 65535:
            parser.error("--port must be between 1 and 65535")
        return args
    if argv and argv[0] in ("train", "simulate"):
        parser = argparse.ArgumentParser(description="Blackjack simulation and basic-strategy training")
        commands = parser.add_subparsers(dest="command", required=True)
        train = commands.add_parser("train", help="practice basic strategy")
        _add_table_options(train, bankroll=1_000.0)
        train.add_argument("--bet", type=float, default=25.0, help="wager per training round (default: $25)")
        _add_practice_options(train)
        simulate = commands.add_parser("simulate", help="run Monte Carlo simulations")
        _add_table_options(simulate, bankroll=INITIAL_MONEY)
        simulate.add_argument("--simulations", type=int, default=10_000)
        simulate.add_argument("--tui", action="store_true", help="show live simulation progress")
    else:
        parser = argparse.ArgumentParser(
            description="Blackjack simulation and basic-strategy training",
            epilog="Commands: train (terminal trainer), simulate (batch simulation), web (browser trainer). "
                   "Without a command, legacy simulation options and --train still work.",
        )
        _add_table_options(parser, bankroll=INITIAL_MONEY)
        parser.add_argument("--simulations", type=int, default=10_000)
        parser.add_argument("--tui", action="store_true", help="show live simulation progress")
        parser.add_argument("--train", action="store_true", help="start the interactive strategy trainer")
        parser.add_argument("--bet", type=float, help="wager when using --train (default: $25)")
        _add_practice_options(parser)

    args = parser.parse_args(argv)
    if getattr(args, "command", None) == "train" or getattr(args, "train", False):
        if args.bet is None:
            args.bet = 25.0
        if args.bet <= 0:
            parser.error("--bet must be positive")
        if args.practice == "surrender" and not args.surrender:
            parser.error("--practice surrender requires --surrender")
    elif getattr(args, "bet", None) is not None:
        parser.error("--bet requires --train or the train command")
    elif getattr(args, "practice", "all") != "all" or getattr(args, "require_correction", False) or getattr(args, "delayed_feedback", False):
        parser.error("practice options require --train or the train command")
    return args


def main(argv=None):
    args = _parse_cli(sys.argv[1:] if argv is None else argv)

    if getattr(args, "command", None) == "web":
        try:
            from .web import main as web_main
        except ImportError as exc:
            raise SystemExit('Web dependencies missing. Install with: uv sync --extra web') from exc
        web_main(["--port", str(args.port)])
        return

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
    if getattr(args, "command", None) == "train" or getattr(args, "train", False):
        from .trainer_tui import run_trainer

        run_trainer(
            strategy_type, rules, args.bankroll, args.seed, bet=args.bet,
            practice=args.practice, require_correction=args.require_correction,
            delayed_feedback=args.delayed_feedback,
        )
        return
    started = time.perf_counter()
    progress = None
    display = None
    if args.tui:
        from .tui import ProgressDisplay

        display = ProgressDisplay(args.simulations, args.bankroll, strategy=strategy_type.value)
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
    print(f"Win rate: {result.win_rate:.2%}  Loss rate: {result.loss_rate:.2%}  Push rate: {result.push_rate:.2%}  Surrender rate: {result.surrender_rate:.2%}")
    print(f"Player bust rate: {result.player_bust_rate:.2%}  Dealer bust rate: {result.dealer_bust_rate:.2%}")
    print(f"Average initial bet: ${result.average_initial_bet:,.2f}  Average wager/hand: ${result.average_bet:,.2f}")
    print(f"Return on wager: {result.return_on_wager:+.2%}  Profit/100 hands: ${result.profit_per_100_hands:,.2f}")
    print(f"Profit p05/p50/p95: ${result.profit_p05:,.2f} / ${result.profit_median:,.2f} / ${result.profit_p95:,.2f}")
    print(f"Profitable shoes: {result.profitable_simulations / result.simulations:.2%}  Max drawdown: ${result.max_drawdown:,.2f}")
    print(f"Actions: {result.hits:,} hits  {result.stands:,} stands  {result.doubles:,} doubles  {result.splits:,} splits")
    print(f"Finished in {elapsed_ms}ms")


if __name__ == "__main__":
    main()
