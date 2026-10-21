import unittest

from blackjack_analysis.game import RoundStatus, Rules
from blackjack_analysis.strategy import Decision, StrategyType
from blackjack_analysis.trainer import TrainerSession


class TrainerTests(unittest.TestCase):
    def session(self, shoe, practice="all", require_correction=False, delayed_feedback=False, **rules):
        return TrainerSession(
            StrategyType.STANDS_ON_SOFT_17,
            Rules(penetration=0.99, **rules),
            shoe=shoe,
            practice=practice,
            require_correction=require_correction,
            delayed_feedback=delayed_feedback,
        )

    def test_incorrect_legal_choice_is_recorded_and_played(self):
        session = self.session([7, 6, 10, 10])
        feedback = session.choose(Decision.STAND)
        self.assertFalse(feedback.correct)
        self.assertEqual(feedback.recommendation.action, Decision.HIT)
        self.assertIn("Your choice was played", feedback.message)
        self.assertEqual(session.round.status, RoundStatus.COMPLETE)
        self.assertEqual(session.stats.decisions, 1)
        self.assertEqual(session.stats.correct_decisions, 0)
        self.assertEqual(session.stats.losses, 1)

    def test_correct_choice_updates_accuracy_and_streak(self):
        session = self.session([5, 7, 6, 10, 10])
        feedback = session.choose(Decision.HIT)
        self.assertTrue(feedback.correct)
        self.assertEqual(session.stats.accuracy, 1.0)
        self.assertEqual(session.stats.current_streak, 1)
        self.assertEqual(session.stats.best_streak, 1)

    def test_non_busting_hit_does_not_end_round(self):
        # Pop order produces dealer 10/7 and player A/2, followed by a 10.
        session = self.session([10, 7, 2, 11, 10])
        feedback = session.choose(Decision.HIT)

        self.assertTrue(feedback.correct)
        self.assertEqual(session.round.status, RoundStatus.PLAYER_TURN)
        self.assertEqual(session.round.active_hand.total, 13)
        self.assertIn(Decision.HIT, session.available_actions)
        self.assertEqual(session.stats.rounds, 0)

    def test_illegal_choice_does_not_count_as_decision(self):
        session = self.session([7, 6, 10, 10])
        feedback = session.choose(Decision.SPLIT)
        self.assertTrue(feedback.illegal)
        self.assertEqual(session.stats.decisions, 0)
        self.assertEqual(session.round.status, RoundStatus.PLAYER_TURN)

    def test_recommendation_contains_teaching_context(self):
        session = self.session([7, 6, 10, 10])
        recommendation = session.recommendation
        self.assertEqual(recommendation.hand_kind, "hard")
        self.assertEqual(recommendation.player_total, 16)
        self.assertEqual(recommendation.dealer_card, 10)
        self.assertIn("hard 16", recommendation.explanation)

    def test_snapshot_hides_dealer_hole_card(self):
        session = self.session([7, 6, 10, 10])
        snapshot = session.snapshot()
        self.assertIsNone(snapshot["dealer_cards"][1])
        session.choose(Decision.STAND)
        self.assertIsNotNone(session.snapshot()["dealer_cards"][1])

    def test_split_decision_is_trained_before_each_new_hand(self):
        session = self.session([5, 2, 3, 10, 8, 8, 6])
        feedback = session.choose(Decision.SPLIT)
        self.assertTrue(feedback.correct)
        self.assertEqual(session.stats.decisions, 1)
        self.assertEqual(len(session.round.hands), 2)
        self.assertEqual(session.round.active_hand_index, 0)
        self.assertIn(Decision.HIT, session.available_actions)
        self.assertIn(Decision.STAND, session.available_actions)

    def test_trainer_can_resplit_until_three_splits_are_used(self):
        session = self.session([2, 8, 8, 8, 8, 8, 8, 10, 8, 8, 6])
        for count in range(1, 4):
            self.assertIn(Decision.SPLIT, session.available_actions)
            feedback = session.choose(Decision.SPLIT)
            self.assertFalse(feedback.illegal)
            self.assertEqual(session.round.splits_used, count)
            self.assertEqual(session.round.active_hand_index, 0)

        self.assertNotIn(Decision.SPLIT, session.available_actions)
        feedback = session.choose(Decision.SPLIT)
        self.assertTrue(feedback.illegal)
        self.assertEqual(session.stats.decisions, 3)
        self.assertEqual(session.round.splits_used, 3)

    def test_natural_blackjack_resolves_without_a_training_decision(self):
        session = self.session([7, 10, 11, 6])
        self.assertEqual(session.round.status, RoundStatus.COMPLETE)
        self.assertEqual(session.stats.decisions, 0)
        self.assertEqual(session.stats.player_blackjacks, 1)
        self.assertEqual(session.stats.wins, 1)
        self.assertEqual(session.feedback.message, "Blackjack!")

    def test_require_correction_retries_without_playing_wrong_choice(self):
        session = self.session([2, 7, 6, 10, 10], require_correction=True)
        cards = list(session.round.active_hand.cards)
        feedback = session.choose(Decision.STAND)
        self.assertFalse(feedback.correct)
        self.assertIn("Try again", feedback.message)
        self.assertEqual(session.round.status, RoundStatus.PLAYER_TURN)
        self.assertEqual(session.round.active_hand.cards, cards)
        self.assertEqual(session.stats.decisions, 1)
        self.assertEqual(session.stats.rounds, 0)
        session.choose(Decision.HIT)
        self.assertEqual(session.stats.decisions, 2)
        self.assertEqual(session.stats.correct_decisions, 1)
        self.assertEqual(len(session.round.hands[0].cards), 3)

    def test_delayed_feedback_hides_accuracy_until_round_ends(self):
        # The hit gives hard 13; an incorrect stand ends the round.
        session = self.session([10, 7, 2, 11, 10], delayed_feedback=True)
        session.choose(Decision.HIT)
        self.assertEqual(session.round.status, RoundStatus.PLAYER_TURN)
        self.assertIsNone(session.feedback.correct)
        self.assertEqual(session.stats.decisions, 0)
        self.assertNotIn("Basic strategy recommends", session.feedback.message)
        session.choose(Decision.STAND)
        self.assertEqual(session.round.status, RoundStatus.COMPLETE)
        self.assertEqual(session.stats.decisions, 2)
        self.assertEqual(session.stats.correct_decisions, 1)
        self.assertIn("Round complete", session.feedback.message)
        self.assertIn("Basic strategy recommends hit", session.feedback.message)

    def test_practice_filters_select_matching_opening_hands(self):
        # First round is a pair; the next round is soft A/2.
        shoe = [10, 2, 11, 7, 10, 8, 8, 6]
        soft = self.session(shoe, practice="soft")
        self.assertEqual(soft.recommendation.hand_kind, "soft")
        self.assertEqual(soft.stats.rounds, 0)
        self.assertEqual(len(soft.game.shoe), 0)
        pair = self.session(shoe, practice="pair")
        self.assertEqual(pair.recommendation.hand_kind, "pair")
        self.assertEqual(len(pair.game.shoe), 4)

        hard = self.session([10, 6, 10, 7, 10, 8, 8, 6], practice="hard")
        self.assertEqual(hard.recommendation.hand_kind, "hard")
        surrender = self.session([7, 6, 10, 10], allow_surrender=True, practice="surrender")
        self.assertEqual(surrender.recommendation.action, Decision.SURRENDER)
        with self.assertRaisesRegex(ValueError, "surrender practice requires"):
            self.session([7, 6, 10, 10], practice="surrender")

    def test_missed_practice_revisits_previous_mistakes(self):
        # With no misses yet, practice normally; the next deal repeats hard 16 vs 10.
        session = self.session([7, 6, 10, 10, 7, 6, 10, 10], practice="missed")
        session.choose(Decision.STAND)
        self.assertIn("hard 16 vs 10", session.stats.missed_situations)
        session.next_round()
        self.assertEqual(session.recommendation.hand_kind, "hard")
        self.assertEqual(session.recommendation.player_total, 16)
        self.assertEqual(session.recommendation.dealer_card, 10)

    def test_missed_practice_does_not_seek_unreachable_hit_situations(self):
        # The mistake is hard 13 after hitting A/2; next deal need not start at 13.
        session = self.session([7, 6, 10, 10, 10, 7, 2, 11, 10], practice="missed")
        session.choose(Decision.HIT)
        session.choose(Decision.STAND)
        self.assertIn("hard 13 vs 10", session.stats.missed_situations)
        self.assertFalse(session.stats.opening_misses)
        session.next_round()
        self.assertEqual(session.recommendation.player_total, 16)

    def test_filtered_test_shoe_without_match_fails_clearly(self):
        with self.assertRaisesRegex(ValueError, "no matching opening hand"):
            self.session([7, 6, 10, 10], practice="pair")

    def test_feedback_modes_are_mutually_exclusive(self):
        with self.assertRaisesRegex(ValueError, "cannot be combined"):
            self.session([7, 6, 10, 10], require_correction=True, delayed_feedback=True)


if __name__ == "__main__":
    unittest.main()
