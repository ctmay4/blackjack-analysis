import random
from collections import Counter
from dataclasses import dataclass, field

from .game import BlackjackGame, Outcome, RoundStatus, Rules, Shoe
from .strategy import Decision, Recommendation, Strategy, StrategyType


@dataclass(frozen=True)
class Feedback:
    message: str
    chosen: Decision | None = None
    recommendation: Recommendation | None = None
    correct: bool | None = None
    illegal: bool = False


@dataclass
class TrainingStats:
    decisions: int = 0
    correct_decisions: int = 0
    current_streak: int = 0
    best_streak: int = 0
    decisions_by_kind: Counter = field(default_factory=Counter)
    correct_by_kind: Counter = field(default_factory=Counter)
    mistakes_by_choice: Counter = field(default_factory=Counter)
    mistakes_by_recommendation: Counter = field(default_factory=Counter)
    missed_situations: Counter = field(default_factory=Counter)
    opening_misses: Counter = field(default_factory=Counter)
    rounds: int = 0
    hands: int = 0
    wins: int = 0
    losses: int = 0
    pushes: int = 0
    surrenders: int = 0
    player_blackjacks: int = 0
    dealer_blackjacks: int = 0
    player_busts: int = 0

    @property
    def accuracy(self):
        return self.correct_decisions / self.decisions if self.decisions else 0.0

    def accuracy_for(self, hand_kind):
        decisions = self.decisions_by_kind[hand_kind]
        return self.correct_by_kind[hand_kind] / decisions if decisions else 0.0


class TrainerSession:
    """UI-independent basic-strategy training session."""

    PRACTICE_MODES = ("all", "hard", "soft", "pair", "surrender", "missed")

    def __init__(
        self,
        strategy_type=StrategyType.STANDS_ON_SOFT_17,
        rules=None,
        bankroll=1_000.0,
        bet=25.0,
        seed=None,
        shoe=None,
        practice="all",
        require_correction=False,
        delayed_feedback=False,
    ):
        self.rules = rules or Rules(
            dealer_hits_soft_17=strategy_type is StrategyType.HITS_ON_SOFT_17
        )
        self.strategy_type = strategy_type
        self.strategy = Strategy(
            strategy_type,
            allow_surrender=self.rules.allow_surrender,
            double_after_split=self.rules.double_after_split,
        )
        self.rng = random.Random(seed)
        if practice not in self.PRACTICE_MODES:
            raise ValueError(f"unknown practice mode: {practice}")
        if practice == "surrender" and not self.rules.allow_surrender:
            raise ValueError("surrender practice requires surrender to be enabled")
        if require_correction and delayed_feedback:
            raise ValueError("require-correction and delayed-feedback cannot be combined")
        self.practice = practice
        self.require_correction = require_correction
        self.delayed_feedback = delayed_feedback
        self._round_attempts = []
        self._custom_shoe = shoe is not None
        game_shoe = shoe if isinstance(shoe, Shoe) else Shoe(shoe) if shoe is not None else None
        self.game = BlackjackGame(self.rules, game_shoe, self.rng)
        self.initial_bankroll = float(bankroll)
        self.bankroll = float(bankroll)
        self.bet = float(bet)
        self.stats = TrainingStats()
        self.feedback = Feedback("Choose the best basic-strategy action.")
        self._recorded_round = None
        self._start_round()

    @property
    def round(self):
        return self.game.round

    @property
    def available_actions(self):
        return self.game.available_actions

    @property
    def recommendation(self):
        hand = self.round.active_hand
        if hand is None:
            return None
        actions = self.available_actions
        return self.strategy.recommend(
            self.round.dealer_cards[0].value,
            hand.strategy_hand,
            first_turn=hand.first_turn and not hand.split_hand,
            can_double=Decision.DOUBLE in actions,
            can_split=Decision.SPLIT in actions,
        )

    def choose(self, action):
        if not isinstance(action, Decision):
            action = Decision(action)
        if self.round.status is RoundStatus.COMPLETE:
            self.feedback = Feedback("The round is complete. Start the next round.", illegal=True)
            return self.feedback
        if action not in self.available_actions:
            self.feedback = Feedback(
                f"{action.value.title()} is not available for this hand.",
                chosen=action,
                illegal=True,
            )
            return self.feedback

        recommendation = self.recommendation
        correct = action is recommendation.action
        hand = self.round.active_hand
        opening = hand.first_turn and not hand.split_hand and len(hand.cards) == 2
        if correct:
            message = f"Correct — {action.value.title()}."
        else:
            message = (
                f"You chose {action.value}; {recommendation.explanation} "
                "Your choice was played."
            )
        if not self.delayed_feedback:
            self._score_choice(action, recommendation, correct, opening)
        if self.require_correction and not correct:
            self.feedback = Feedback(
                f"Try again — {recommendation.explanation}", action, recommendation, False
            )
            return self.feedback

        self._round_attempts.append((action, recommendation, correct, opening))
        if self.delayed_feedback:
            self.feedback = Feedback("Choice played. Feedback after the round.", action)
        else:
            self.feedback = Feedback(message, action, recommendation, correct)
        self.game.apply(action)
        if self.delayed_feedback and self.round.status is RoundStatus.COMPLETE:
            for chosen, rec, was_correct, was_opening in self._round_attempts:
                self._score_choice(chosen, rec, was_correct, was_opening)
            mistakes = [rec.explanation for _, rec, was_correct, _ in self._round_attempts if not was_correct]
            summary = f"Round complete: {len(self._round_attempts) - len(mistakes)}/{len(self._round_attempts)} correct."
            self.feedback = Feedback(summary + (" " + " ".join(mistakes) if mistakes else ""))
        self._record_completed_round()
        return self.feedback

    def _score_choice(self, action, recommendation, correct, opening):
        self.stats.decisions += 1
        self.stats.decisions_by_kind[recommendation.hand_kind] += 1
        if correct:
            self.stats.correct_decisions += 1
            self.stats.correct_by_kind[recommendation.hand_kind] += 1
            self.stats.current_streak += 1
            self.stats.best_streak = max(self.stats.best_streak, self.stats.current_streak)
        else:
            self.stats.current_streak = 0
            self.stats.mistakes_by_choice[action.value] += 1
            self.stats.mistakes_by_recommendation[recommendation.action.value] += 1
            self.stats.missed_situations[self._situation(recommendation)] += 1
            if opening:
                self.stats.opening_misses[self._situation(recommendation)] += 1

    def next_round(self):
        if self.round.status is not RoundStatus.COMPLETE:
            raise RuntimeError("the current round is not complete")
        self._start_round()
        return self.round

    def _start_round(self):
        for _ in range(10_000):
            cut_card = self.rules.decks * 52 * self.rules.penetration
            if not self._custom_shoe and len(self.game.shoe) <= cut_card:
                self.game.shoe = Shoe.shuffled(self.rules.decks, self.rng)
            if self._custom_shoe and len(self.game.shoe) < 4:
                raise ValueError("no matching opening hand remains in the test shoe")
            self.game.start_round(self.bet)
            if self._matches_practice():
                break
            # Discard this opening deal without playing it or affecting statistics.
            self.game.round.status = RoundStatus.COMPLETE
        else:
            raise RuntimeError("could not find a hand matching the practice filter")
        self._recorded_round = None
        self._round_attempts = []
        if self.game.round.status is RoundStatus.COMPLETE:
            result = self.game.round.result
            player_blackjack = any(
                len(hand.cards) == 2
                and sum(card.value for card in hand.cards) == 21
                and not hand.split_hand
                for hand in result.hands
            )
            if result.dealer_blackjack and player_blackjack:
                message = "Both player and dealer have blackjack — push."
            elif result.dealer_blackjack:
                message = "Dealer blackjack."
            else:
                message = "Blackjack!"
            self.feedback = Feedback(message)
        else:
            self.feedback = Feedback("Choose the best basic-strategy action.")
        self._record_completed_round()

    def _situation(self, recommendation):
        dealer = "A" if recommendation.dealer_card == 11 else recommendation.dealer_card
        return f"{recommendation.hand_kind} {recommendation.player_total} vs {dealer}"

    def _matches_practice(self):
        if self.practice == "all" or self.practice == "missed" and not self.stats.opening_misses:
            return True
        recommendation = self.recommendation
        if recommendation is None:
            return False
        if self.practice == "missed":
            return self._situation(recommendation) in self.stats.opening_misses
        if self.practice == "surrender":
            return recommendation.action is Decision.SURRENDER
        return recommendation.hand_kind == self.practice

    def _record_completed_round(self):
        if self.round.status is not RoundStatus.COMPLETE or self._recorded_round is self.round:
            return
        result = self.round.result
        self._recorded_round = self.round
        self.stats.rounds += 1
        self.stats.hands += len(result.hands)
        self.stats.dealer_blackjacks += result.dealer_blackjack
        self.bankroll += result.profit
        for hand in result.hands:
            if hand.outcome is Outcome.WIN:
                self.stats.wins += 1
            elif hand.outcome is Outcome.LOSS:
                self.stats.losses += 1
            elif hand.outcome is Outcome.PUSH:
                self.stats.pushes += 1
            else:
                self.stats.surrenders += 1
            values = tuple(card.value for card in hand.cards)
            total = sum(values)
            for _ in range(values.count(11)):
                if total > 21:
                    total -= 10
            self.stats.player_busts += total > 21
            self.stats.player_blackjacks += len(values) == 2 and total == 21 and not hand.split_hand

    def snapshot(self):
        complete = self.round.status is RoundStatus.COMPLETE

        def card_data(card):
            return {
                "rank": card.rank.label,
                "suit": card.suit.value if card.suit else "",
                "value": card.value,
            }

        dealer_cards = [card_data(self.round.dealer_cards[0])]
        dealer_cards.extend(
            card_data(card) if complete else None for card in self.round.dealer_cards[1:]
        )
        return {
            "status": self.round.status.value,
            "dealer_cards": dealer_cards,
            "hands": [
                {
                    "cards": [card_data(card) for card in hand.cards],
                    "total": hand.total,
                    "soft": hand.soft,
                    "active": index == self.round.active_hand_index,
                    "bet": hand.bet,
                }
                for index, hand in enumerate(self.round.hands)
            ],
            "available_actions": sorted(action.value for action in self.available_actions),
            "feedback": self.feedback.message,
            "bankroll": self.bankroll,
            "stats": {
                "decisions": self.stats.decisions,
                "correct": self.stats.correct_decisions,
                "accuracy": self.stats.accuracy,
                "current_streak": self.stats.current_streak,
                "best_streak": self.stats.best_streak,
                "rounds": self.stats.rounds,
                "wins": self.stats.wins,
                "losses": self.stats.losses,
                "pushes": self.stats.pushes,
                "surrenders": self.stats.surrenders,
            },
        }
