import unittest

from blackjack_analysis.blackjack import Rules, run_simulations, simulate
from blackjack_analysis.strategy import StrategyType


class SimulationTests(unittest.TestCase):
    def one_round(self, shoe, strategy_type=StrategyType.STANDS_ON_SOFT_17, **kwargs):
        rules = Rules(penetration=0.99, **kwargs)
        return simulate(strategy_type=strategy_type, rules=rules, shoe=shoe)

    def test_push_does_not_change_bankroll(self):
        # Pop order: dealer up, player cards, dealer hole.
        result = self.one_round([7, 7, 10, 10])
        self.assertEqual(result.rounds, 1)
        self.assertEqual(result.pushes, 1)
        self.assertEqual(result.profit, 0)

    def test_blackjack_pays_three_to_two(self):
        result = self.one_round([8, 10, 11, 9])
        self.assertEqual(result.blackjacks, 1)
        self.assertEqual(result.wins, 1)
        self.assertEqual(result.profit, 37.5)

    def test_blackjack_pushes_against_dealer_blackjack(self):
        result = self.one_round([10, 10, 11, 11])
        self.assertEqual(result.blackjacks, 1)
        self.assertEqual(result.pushes, 1)
        self.assertEqual(result.profit, 0)

    def test_dealer_blackjack_ends_non_natural_hand(self):
        result = self.one_round([2, 10, 8, 8, 11])
        self.assertEqual(result.hands, 1)
        self.assertEqual(result.losses, 1)
        self.assertEqual(result.profit, -25)

    def test_surrender_is_configurable(self):
        result = self.one_round([7, 6, 10, 10], allow_surrender=True)
        self.assertEqual(result.surrenders, 1)
        self.assertEqual(result.profit, -12.5)

    def test_strategy_selects_matching_dealer_rule(self):
        # Player 17 stands; dealer 6 + ace is soft 17, then draws a 2 when required.
        stand = self.one_round([2, 11, 10, 7, 6])
        hit = self.one_round(
            [2, 11, 10, 7, 6],
            strategy_type=StrategyType.HITS_ON_SOFT_17,
            dealer_hits_soft_17=True,
        )
        self.assertEqual(stand.profit, 0)
        self.assertEqual(hit.profit, -25)

    def test_split_aces_receive_one_card(self):
        shoe = [5, 5, 11, 11, 11, 6]
        result = self.one_round(shoe)
        self.assertEqual(result.hands, 2)
        self.assertEqual(result.losses, 2)
        self.assertEqual(result.profit, -50)

    def test_split_limits_are_enforced(self):
        result = self.one_round([2, 11, 8, 8, 6], max_splits=0)
        self.assertEqual(result.hands, 1)
        self.assertEqual(result.profit, -25)

        result = self.one_round([2, 11, 11, 11, 6], resplit_aces=False)
        self.assertEqual(result.hands, 1)
        self.assertEqual(result.profit, -25)

    def test_seeded_runs_are_reproducible(self):
        rules = Rules(decks=1, penetration=0.75)
        first = run_simulations(3, rules=rules, seed=42)
        second = run_simulations(3, rules=rules, seed=42)
        self.assertEqual(first, second)
        self.assertGreater(first.hands, 0)


if __name__ == "__main__":
    unittest.main()
