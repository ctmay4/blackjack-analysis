import unittest

from blackjack_analysis.game import BlackjackGame, Outcome, RoundStatus, Rules, Shoe
from blackjack_analysis.strategy import Decision


class GameTests(unittest.TestCase):
    def game(self, cards, **rules):
        return BlackjackGame(Rules(penetration=0.99, **rules), Shoe(cards))

    def test_exposes_physical_cards_and_hides_no_game_state(self):
        game = self.game([7, 6, 10, 10])
        state = game.start_round()
        self.assertEqual(state.dealer_cards[0].value, 10)
        self.assertEqual([card.value for card in state.hands[0].cards], [10, 6])
        self.assertEqual(state.dealer_cards[1].value, 7)

    def test_double_draws_exactly_one_card_and_ends_hand(self):
        # Pop order: up 6, player 5+6, hole 10, double 10, dealer 5.
        game = self.game([5, 10, 10, 6, 5, 6])
        state = game.start_round(25)
        game.apply(Decision.DOUBLE)
        self.assertEqual(state.status, RoundStatus.COMPLETE)
        self.assertEqual([card.value for card in state.hands[0].cards], [5, 6, 10])
        self.assertEqual(state.result.hands[0].bet, 50)
        self.assertEqual(state.result.hands[0].outcome, Outcome.PUSH)

    def test_hit_below_twenty_one_keeps_hand_active(self):
        # Ace + 2 + 10 is hard 13, not a completed or busted hand.
        game = self.game([10, 7, 2, 11, 10])
        state = game.start_round(25)
        game.apply(Decision.HIT)

        self.assertEqual(state.status, RoundStatus.PLAYER_TURN)
        self.assertEqual(state.active_hand.total, 13)
        self.assertFalse(state.active_hand.bust)
        self.assertIn(Decision.HIT, game.available_actions)

    def test_available_actions_follow_rules(self):
        game = self.game([7, 8, 8, 6], allow_surrender=True)
        game.start_round()
        self.assertEqual(
            game.available_actions,
            {
                Decision.HIT,
                Decision.STAND,
                Decision.DOUBLE,
                Decision.SPLIT,
                Decision.SURRENDER,
            },
        )

    def test_surrender_settles_half_the_bet(self):
        game = self.game([7, 6, 10, 10], allow_surrender=True)
        state = game.start_round(20)
        game.apply(Decision.SURRENDER)
        self.assertEqual(state.result.hands[0].outcome, Outcome.SURRENDER)
        self.assertEqual(state.result.profit, -10)

    def test_split_hands_are_played_in_order(self):
        # Pop order: up, pair, hole, first split draw, second split draw, dealer draw.
        game = self.game([5, 2, 3, 10, 8, 8, 6])
        state = game.start_round()
        game.apply(Decision.SPLIT)
        self.assertEqual([card.value for card in state.active_hand.cards], [8, 3])
        game.apply(Decision.STAND)
        self.assertEqual([card.value for card in state.active_hand.cards], [8, 2])
        game.apply(Decision.STAND)
        self.assertEqual(state.status, RoundStatus.COMPLETE)
        self.assertEqual(len(state.result.hands), 2)

    def test_three_splits_are_allowed_but_fourth_is_not(self):
        # Deal 8/8, then another 8 to the first hand after each split.
        # Remaining 8s give each waiting hand its second card.
        game = self.game([2, 8, 8, 8, 8, 8, 8, 10, 8, 8, 6])
        state = game.start_round()
        for count in range(1, 4):
            self.assertIn(Decision.SPLIT, game.available_actions)
            game.apply(Decision.SPLIT)
            self.assertEqual(state.splits_used, count)
            self.assertEqual(len(state.hands), count + 1)
            self.assertEqual(state.active_hand_index, 0)
            self.assertEqual([card.value for card in state.active_hand.cards], [8, 8])

        self.assertNotIn(Decision.SPLIT, game.available_actions)
        self.assertIn(Decision.HIT, game.available_actions)
        with self.assertRaises(ValueError):
            game.apply(Decision.SPLIT)
        self.assertEqual(state.splits_used, 3)

        for _ in range(4):
            game.apply(Decision.STAND)
        self.assertEqual(state.status, RoundStatus.COMPLETE)
        self.assertEqual(len(state.result.hands), 4)
        self.assertTrue(all(hand.split_hand for hand in state.result.hands))

    def test_dealer_soft_17_rule(self):
        stand = self.game([2, 11, 10, 7, 6])
        stand_state = stand.start_round()
        stand.apply(Decision.STAND)
        self.assertEqual(len(stand_state.dealer_cards), 2)

        hit = self.game([2, 11, 10, 7, 6], dealer_hits_soft_17=True)
        hit_state = hit.start_round()
        hit.apply(Decision.STAND)
        self.assertEqual(len(hit_state.dealer_cards), 3)


if __name__ == "__main__":
    unittest.main()
