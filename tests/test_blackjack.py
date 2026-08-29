import unittest

from blackjack_analysis.blackjack import generate_deck, get_bet_size, true_count


class BlackjackTests(unittest.TestCase):
    def test_generation_deck(self):
        deck = generate_deck()
        self.assertEqual(len(deck), 52)
        self.assertEqual(deck.count(10), 16)
        self.assertEqual(deck.count(11), 4)

    def test_true_count_and_bet_spread(self):
        self.assertEqual(true_count([2, 10]), 0)
        self.assertEqual(true_count([2, 2, 10]), -17)
        self.assertEqual(true_count([10, 10, 2]), 17)
        self.assertEqual(get_bet_size(1, 100_000), 25)
        self.assertEqual(get_bet_size(2, 100_000), 100)
        self.assertEqual(get_bet_size(12, 100_000), 1000)


if __name__ == "__main__":
    unittest.main()
