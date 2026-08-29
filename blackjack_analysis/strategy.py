from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class StrategyType(Enum):
    STANDS_ON_SOFT_17 = "stand_soft_17"
    HITS_ON_SOFT_17 = "hit_soft_17"


class Decision(Enum):
    STAND = "stand"
    DOUBLE = "double"
    HIT = "hit"
    SPLIT = "split"
    SURRENDER = "surrender"


@dataclass(frozen=True)
class Hand:
    cards: tuple[int, ...]

    @classmethod
    def from_cards(cls, cards):
        return cls(tuple(cards))

    def __add__(self, card):
        return Hand(self.cards + (card,))

    @property
    def num_aces(self):
        return self.cards.count(11)

    @property
    def total(self):
        total = sum(self.cards)
        for _ in range(self.num_aces):
            if total > 21:
                total -= 10
        return total

    @property
    def soft_total(self):
        return sum(1 if card == 11 else card for card in self.cards)

    @property
    def soft(self):
        return self.total == self.soft_total + 10

    @property
    def can_split(self):
        return len(self.cards) == 2 and self.cards[0] == self.cards[1]

    @property
    def blackjack(self):
        return len(self.cards) == 2 and self.total == 21

    @property
    def bust(self):
        return self.total > 21


class _Action(Enum):
    H = "H"
    S = "S"
    P = "P"
    DH = "DH"
    DS = "DS"
    PH = "PH"
    RH = "RH"
    RS = "RS"
    RP = "RP"


class Strategy:
    """Basic-strategy lookup loaded from a resource table."""

    _DEALER_CARDS = (2, 3, 4, 5, 6, 7, 8, 9, 10, 11)

    def __init__(self, strategy_type, allow_surrender=False, double_after_split=True):
        self.type = strategy_type
        self.allow_surrender = allow_surrender
        self.double_after_split = double_after_split
        self._split_moves = {}
        self._soft_moves = {}
        self._hard_moves = {}
        self._load()

    def _load(self):
        sections = {
            "[split]": self._split_moves,
            "[soft]": self._soft_moves,
            "[hard]": self._hard_moves,
        }
        current = None
        path = Path(__file__).parent / "resources" / self.type.value

        for line_number, raw_row in enumerate(path.read_text(encoding="ascii").splitlines(), 1):
            row = raw_row.strip()
            if not row or row.startswith("#"):
                continue
            if row in sections:
                current = sections[row]
                continue
            if current is None:
                raise ValueError(f"Strategy row before a section at {path}:{line_number}")

            fields = row.split()
            if len(fields) != len(self._DEALER_CARDS) + 1:
                raise ValueError(f"Expected 11 columns at {path}:{line_number}")
            try:
                key = int(fields[0])
                actions = {
                    dealer: _Action(fields[index + 1])
                    for index, dealer in enumerate(self._DEALER_CARDS)
                }
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Invalid strategy row at {path}:{line_number}") from exc
            current[key] = actions

    def decide(self, dealer, player, first_turn=True, can_double=True, can_split=True):
        if player.total > 21:
            return Decision.STAND

        action = None
        if player.can_split and can_split:
            action = self._split_moves.get(player.cards[0], {}).get(dealer)
        if action is None and player.soft:
            action = self._soft_moves.get(player.soft_total, {}).get(dealer)
        if action is None:
            action = self._hard_moves.get(player.total, {}).get(dealer)
        if action is None:
            raise ValueError(
                f"Unable to decide for hand {list(player.cards)} with dealer showing [{dealer}]"
            )

        if action is _Action.H:
            return Decision.HIT
        if action is _Action.S:
            return Decision.STAND
        if action is _Action.P:
            return Decision.SPLIT
        if action is _Action.DH:
            return Decision.DOUBLE if len(player.cards) == 2 and can_double else Decision.HIT
        if action is _Action.DS:
            return Decision.DOUBLE if len(player.cards) == 2 and can_double else Decision.STAND
        if action is _Action.PH:
            return Decision.SPLIT if self.double_after_split else Decision.HIT
        if action is _Action.RH:
            return Decision.SURRENDER if self.allow_surrender and first_turn and len(player.cards) == 2 else Decision.HIT
        if action is _Action.RS:
            return Decision.SURRENDER if self.allow_surrender and first_turn and len(player.cards) == 2 else Decision.STAND
        if action is _Action.RP:
            return Decision.SURRENDER if self.allow_surrender and first_turn and len(player.cards) == 2 else Decision.SPLIT
        raise ValueError(f"Unknown strategy action: {action}")
