import random
from dataclasses import dataclass, field
from enum import Enum

from .strategy import Decision, Hand


class Suit(Enum):
    SPADES = "♠"
    HEARTS = "♥"
    DIAMONDS = "♦"
    CLUBS = "♣"


class Rank(Enum):
    TWO = ("2", 2)
    THREE = ("3", 3)
    FOUR = ("4", 4)
    FIVE = ("5", 5)
    SIX = ("6", 6)
    SEVEN = ("7", 7)
    EIGHT = ("8", 8)
    NINE = ("9", 9)
    TEN = ("10", 10)
    JACK = ("J", 10)
    QUEEN = ("Q", 10)
    KING = ("K", 10)
    ACE = ("A", 11)

    def __init__(self, label, value):
        self.label = label
        self.card_value = value


@dataclass(frozen=True)
class Card:
    rank: Rank
    suit: Suit | None = None

    @property
    def value(self):
        return self.rank.card_value

    @property
    def label(self):
        return f"{self.rank.label}{self.suit.value if self.suit else ''}"

    @classmethod
    def from_value(cls, value):
        if value == 11:
            return cls(Rank.ACE)
        if value == 10:
            return cls(Rank.TEN)
        for rank in Rank:
            if rank.card_value == value:
                return cls(rank)
        raise ValueError(f"invalid card value: {value}")


class Shoe:
    def __init__(self, cards):
        self.cards = [card if isinstance(card, Card) else Card.from_value(card) for card in cards]

    @classmethod
    def shuffled(cls, decks=8, rng=None):
        if decks < 1:
            raise ValueError("decks must be at least 1")
        cards = [Card(rank, suit) for _ in range(decks) for suit in Suit for rank in Rank]
        (rng or random).shuffle(cards)
        return cls(cards)

    def draw(self):
        if not self.cards:
            raise RuntimeError("shoe ran out of cards")
        return self.cards.pop()

    @property
    def values(self):
        return [card.value for card in self.cards]

    def __len__(self):
        return len(self.cards)


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


class RoundStatus(Enum):
    PLAYER_TURN = "player_turn"
    COMPLETE = "complete"


class Outcome(Enum):
    WIN = "win"
    LOSS = "loss"
    PUSH = "push"
    SURRENDER = "surrender"


@dataclass
class PlayerHandState:
    cards: list[Card]
    bet: float
    split_hand: bool = False
    first_turn: bool = True
    finished: bool = False
    surrendered: bool = False
    doubled: bool = False

    @property
    def strategy_hand(self):
        return Hand.from_cards(card.value for card in self.cards)

    @property
    def total(self):
        return self.strategy_hand.total

    @property
    def soft(self):
        return self.strategy_hand.soft

    @property
    def bust(self):
        return self.strategy_hand.bust

    @property
    def blackjack(self):
        return self.strategy_hand.blackjack and not self.split_hand

    @property
    def can_split(self):
        return len(self.cards) == 2 and self.cards[0].value == self.cards[1].value


@dataclass(frozen=True)
class HandResult:
    outcome: Outcome
    bet: float
    profit: float
    cards: tuple[Card, ...]
    split_hand: bool
    doubled: bool


@dataclass(frozen=True)
class RoundResult:
    hands: tuple[HandResult, ...]
    dealer_cards: tuple[Card, ...]
    dealer_bust: bool
    dealer_blackjack: bool

    @property
    def profit(self):
        return sum(hand.profit for hand in self.hands)


@dataclass
class RoundState:
    dealer_cards: list[Card]
    hands: list[PlayerHandState]
    active_hand_index: int | None = 0
    status: RoundStatus = RoundStatus.PLAYER_TURN
    splits_used: int = 0
    result: RoundResult | None = None

    @property
    def dealer_hand(self):
        return Hand.from_cards(card.value for card in self.dealer_cards)

    @property
    def active_hand(self):
        if self.active_hand_index is None:
            return None
        return self.hands[self.active_hand_index]


class BlackjackGame:
    """A step-driven blackjack game with no input or presentation concerns."""

    def __init__(self, rules=None, shoe=None, rng=None):
        self.rules = rules or Rules()
        self.rng = rng or random.Random()
        self.shoe = shoe or Shoe.shuffled(self.rules.decks, self.rng)
        self.round: RoundState | None = None

    def start_round(self, bet=25.0):
        if bet <= 0:
            raise ValueError("bet must be positive")
        if self.round is not None and self.round.status is not RoundStatus.COMPLETE:
            raise RuntimeError("the current round is not complete")
        dealer_up = self.shoe.draw()
        player_cards = [self.shoe.draw(), self.shoe.draw()]
        dealer_hole = self.shoe.draw()
        self.round = RoundState(
            dealer_cards=[dealer_up, dealer_hole],
            hands=[PlayerHandState(player_cards, float(bet))],
        )
        if self.round.dealer_hand.blackjack or self.round.hands[0].blackjack:
            self.round.hands[0].finished = True
            self._finish_round()
        return self.round

    @property
    def available_actions(self):
        if self.round is None or self.round.status is RoundStatus.COMPLETE:
            return frozenset()
        hand = self.round.active_hand
        if hand is None:
            return frozenset()
        actions = {Decision.HIT, Decision.STAND}
        if len(hand.cards) == 2 and (not hand.split_hand or self.rules.double_after_split):
            actions.add(Decision.DOUBLE)
        if (
            hand.can_split
            and self.round.splits_used < self.rules.max_splits
            and (self.rules.resplit_aces or hand.cards[0].value != 11)
        ):
            actions.add(Decision.SPLIT)
        if self.rules.allow_surrender and hand.first_turn and not hand.split_hand and len(hand.cards) == 2:
            actions.add(Decision.SURRENDER)
        return frozenset(actions)

    def apply(self, action):
        if not isinstance(action, Decision):
            action = Decision(action)
        if action not in self.available_actions:
            raise ValueError(f"{action.value} is not available")
        hand = self.round.active_hand
        if action is Decision.HIT:
            hand.cards.append(self.shoe.draw())
            hand.first_turn = False
            if hand.total >= 21:
                hand.finished = True
        elif action is Decision.STAND:
            hand.finished = True
        elif action is Decision.DOUBLE:
            hand.bet *= 2
            hand.doubled = True
            hand.first_turn = False
            hand.cards.append(self.shoe.draw())
            hand.finished = True
        elif action is Decision.SURRENDER:
            hand.surrendered = True
            hand.finished = True
        elif action is Decision.SPLIT:
            self._split_active_hand()
            return self.round
        if hand.finished:
            self._advance_or_finish()
        return self.round

    def _split_active_hand(self):
        index = self.round.active_hand_index
        old = self.round.active_hand
        self.round.splits_used += 1
        replacement = [
            PlayerHandState([old.cards[0]], old.bet, split_hand=True),
            PlayerHandState([old.cards[1]], old.bet, split_hand=True),
        ]
        self.round.hands[index:index + 1] = replacement
        self.round.active_hand_index = index
        self._prepare_active_split_hand()

    def _prepare_active_split_hand(self):
        hand = self.round.active_hand
        if hand is not None and len(hand.cards) == 1:
            split_card = hand.cards[0]
            hand.cards.append(self.shoe.draw())
            if self.rules.one_card_on_split_aces and split_card.value == 11:
                hand.finished = True
            elif hand.total >= 21:
                hand.finished = True
        if hand is not None and hand.finished:
            self._advance_or_finish()

    def _advance_or_finish(self):
        start = (self.round.active_hand_index or 0) + 1
        for index in range(start, len(self.round.hands)):
            if not self.round.hands[index].finished:
                self.round.active_hand_index = index
                self._prepare_active_split_hand()
                return
        self._finish_round()

    def _finish_round(self):
        dealer = self.round.dealer_hand
        needs_dealer = any(
            not hand.surrendered and not hand.bust and not hand.blackjack
            for hand in self.round.hands
        )
        if not dealer.blackjack and needs_dealer:
            while dealer.total < 17 or (
                dealer.total == 17 and dealer.soft and self.rules.dealer_hits_soft_17
            ):
                self.round.dealer_cards.append(self.shoe.draw())
                dealer = self.round.dealer_hand

        hand_results = []
        for hand in self.round.hands:
            if hand.surrendered:
                outcome, profit = Outcome.SURRENDER, -hand.bet * 0.5
            elif hand.blackjack:
                if dealer.blackjack:
                    outcome, profit = Outcome.PUSH, 0.0
                else:
                    outcome, profit = Outcome.WIN, hand.bet * 1.5
            elif dealer.blackjack or hand.bust:
                outcome, profit = Outcome.LOSS, -hand.bet
            elif dealer.bust:
                outcome, profit = Outcome.WIN, hand.bet
            elif dealer.total > hand.total:
                outcome, profit = Outcome.LOSS, -hand.bet
            elif dealer.total < hand.total:
                outcome, profit = Outcome.WIN, hand.bet
            else:
                outcome, profit = Outcome.PUSH, 0.0
            hand_results.append(
                HandResult(outcome, hand.bet, profit, tuple(hand.cards), hand.split_hand, hand.doubled)
            )
        self.round.active_hand_index = None
        self.round.status = RoundStatus.COMPLETE
        self.round.result = RoundResult(
            tuple(hand_results),
            tuple(self.round.dealer_cards),
            dealer.bust,
            dealer.blackjack,
        )
