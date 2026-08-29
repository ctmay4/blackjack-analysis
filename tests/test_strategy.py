import unittest

from blackjack_analysis.strategy import Decision, Hand, Strategy, StrategyType


class StrategyTests(unittest.TestCase):
    def test_all_combinations_load(self):
        for strategy in (
            Strategy(StrategyType.STANDS_ON_SOFT_17),
            Strategy(StrategyType.HITS_ON_SOFT_17),
        ):
            for card1 in range(2, 12):
                for card2 in range(2, 12):
                    for dealer in range(2, 12):
                        strategy.decide(dealer, Hand.from_cards((card1, card2)), True)
                        strategy.decide(dealer, Hand.from_cards((card1, card2)), False)

    def test_strategy_variants(self):
        stand = Strategy(StrategyType.STANDS_ON_SOFT_17)
        hit = Strategy(StrategyType.HITS_ON_SOFT_17)
        self.assertEqual(
            stand.decide(10, Hand.from_cards((10, 6))),
            hit.decide(10, Hand.from_cards((10, 6))),
        )
        hand = Hand.from_cards((11, 8))
        self.assertEqual(stand.decide(6, hand), Decision.STAND)
        self.assertEqual(hit.decide(6, hand), Decision.DOUBLE)

    def test_is_soft(self):
        self.assertFalse(Hand.from_cards((2, 2)).soft)
        self.assertFalse(Hand.from_cards((10, 4, 11)).soft)
        for cards in ((11, 8), (8, 11), (9, 11), (11, 2), (2, 11), (11, 11, 11)):
            self.assertTrue(Hand.from_cards(cards).soft)

    def test_hand(self):
        hand = Hand.from_cards((11, 8))
        self.assertEqual(hand.num_aces, 1)
        self.assertEqual(hand.soft_total, 9)
        self.assertEqual(hand.total, 19)
        self.assertTrue(hand.soft)

        hand = Hand.from_cards((11, 2, 11))
        self.assertEqual(hand.num_aces, 2)
        self.assertEqual(hand.soft_total, 4)
        self.assertEqual(hand.total, 14)

        hand = Hand.from_cards((10, 6))
        self.assertEqual(hand.total, 16)
        self.assertFalse(hand.bust)
        hand = hand + 10
        self.assertEqual(hand.total, 26)
        self.assertTrue(hand.bust)

        self.assertEqual(Hand.from_cards((10, 6, 11, 11)).total, 18)
        self.assertFalse(Hand.from_cards((10, 6, 11, 11)).bust)
        self.assertEqual(Hand.from_cards((10, 6, 4, 11, 11)).total, 22)
        self.assertTrue(Hand.from_cards((10, 6, 4, 11, 11)).bust)

    def test_decide(self):
        moves = Strategy(StrategyType.STANDS_ON_SOFT_17)
        self.assertEqual(moves.decide(7, Hand.from_cards((7, 7))), Decision.SPLIT)
        self.assertEqual(moves.decide(5, Hand.from_cards((4, 4))), Decision.SPLIT)
        self.assertEqual(
            Strategy(StrategyType.STANDS_ON_SOFT_17, double_after_split=False).decide(
                5, Hand.from_cards((4, 4))
            ),
            Decision.HIT,
        )
        self.assertEqual(moves.decide(5, Hand.from_cards((11, 7))), Decision.DOUBLE)
        self.assertEqual(moves.decide(5, Hand.from_cards((7, 11))), Decision.DOUBLE)
        self.assertEqual(moves.decide(6, Hand.from_cards((5, 10))), Decision.STAND)
        self.assertEqual(moves.decide(10, Hand.from_cards((5, 6))), Decision.DOUBLE)
        self.assertEqual(moves.decide(10, Hand.from_cards((10, 6))), Decision.HIT)
        self.assertEqual(
            Strategy(StrategyType.STANDS_ON_SOFT_17, allow_surrender=True).decide(
                10, Hand.from_cards((10, 6))
            ),
            Decision.SURRENDER,
        )
        self.assertEqual(moves.decide(10, Hand.from_cards((11, 11))), Decision.SPLIT)
        self.assertEqual(moves.decide(10, Hand.from_cards((11, 11)), False), Decision.SPLIT)
        self.assertEqual(moves.decide(10, Hand.from_cards((10, 6, 10))), Decision.STAND)
        self.assertEqual(moves.decide(10, Hand.from_cards((8, 11))), Decision.STAND)
        self.assertEqual(moves.decide(10, Hand.from_cards((11, 9))), Decision.STAND)
        self.assertEqual(moves.decide(10, Hand.from_cards((10, 11))), Decision.STAND)
        self.assertEqual(
            moves.decide(10, Hand.from_cards((5, 6)), can_double=False), Decision.HIT
        )


if __name__ == "__main__":
    unittest.main()
