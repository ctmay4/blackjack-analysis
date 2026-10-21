import subprocess
import sys
import unittest
from unittest.mock import patch

from blackjack_analysis.blackjack import _parse_cli, main
from blackjack_analysis.strategy import StrategyType


class CliTests(unittest.TestCase):
    def command(self, *arguments):
        return subprocess.run(
            [sys.executable, "-m", "blackjack_analysis", *arguments],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_explicit_and_legacy_simulate_commands(self):
        options = ("--simulations", "1", "--seed", "42")
        explicit = self.command("simulate", *options)
        legacy = self.command(*options)
        self.assertEqual(explicit.returncode, 0, explicit.stderr)
        self.assertEqual(legacy.returncode, 0, legacy.stderr)
        self.assertEqual(
            explicit.stdout.rsplit("Finished in ", 1)[0],
            legacy.stdout.rsplit("Finished in ", 1)[0],
        )
        self.assertIn("Average profit:", explicit.stdout)

    def test_mode_defaults_and_options_are_separate(self):
        self.assertEqual(_parse_cli(["simulate"]).simulations, 10_000)
        self.assertEqual(_parse_cli(["simulate"]).bankroll, 100_000)
        self.assertEqual(_parse_cli(["train"]).bankroll, 1_000)
        self.assertEqual(_parse_cli(["train"]).bet, 25)
        self.assertEqual(_parse_cli(["--train"]).bankroll, 100_000)
        self.assertNotEqual(self.command("simulate", "--bet", "50").returncode, 0)
        self.assertIn("--bet requires", self.command("--bet", "50").stderr)

    def test_train_command_uses_training_defaults_and_custom_wager(self):
        with patch("blackjack_analysis.trainer_tui.TrainerApp") as app:
            main(["train", "--seed", "42"])
            session = app.call_args.args[0]
            self.assertEqual(session.initial_bankroll, 1_000)
            self.assertEqual(session.bet, 25)

            main(["train", "--bet", "75", "--bankroll", "2_500", "--strategy", "hit_soft_17"])
            session = app.call_args.args[0]
            self.assertEqual(session.bet, 75)
            self.assertEqual(session.initial_bankroll, 2_500)
            self.assertEqual(session.round.hands[0].bet, 75)
            self.assertEqual(session.strategy_type, StrategyType.HITS_ON_SOFT_17)
            self.assertTrue(session.rules.dealer_hits_soft_17)

    def test_legacy_train_keeps_old_bankroll_default_and_accepts_bet(self):
        with patch("blackjack_analysis.trainer_tui.TrainerApp") as app:
            main(["--train", "--bet", "50", "--seed", "42"])
            session = app.call_args.args[0]
            self.assertEqual(session.initial_bankroll, 100_000)
            self.assertEqual(session.bet, 50)

    def test_command_help_and_invalid_training_wager(self):
        for command in ("train", "simulate"):
            with self.subTest(command=command):
                result = self.command(command, "--help")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("--bankroll", result.stdout)
        self.assertIn("--bet", self.command("train", "--help").stdout)
        self.assertIn("--tui", self.command("simulate", "--help").stdout)
        self.assertNotIn("--bet", self.command("simulate", "--help").stdout)
        for arguments in (("train", "--bet", "0"), ("--train", "--bet", "-2")):
            with self.subTest(arguments=arguments):
                result = self.command(*arguments)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("--bet must be positive", result.stderr)

    def test_training_practice_and_feedback_flags(self):
        with patch("blackjack_analysis.trainer_tui.TrainerApp") as app:
            main(["train", "--practice", "pair", "--require-correction", "--seed", "42"])
            session = app.call_args.args[0]
            self.assertEqual(session.practice, "pair")
            self.assertTrue(session.require_correction)
            main(["--train", "--delayed-feedback", "--seed", "42"])
            self.assertTrue(app.call_args.args[0].delayed_feedback)
        self.assertNotEqual(self.command("train", "--delayed-feedback", "--require-correction").returncode, 0)
        self.assertIn("requires --surrender", self.command("train", "--practice", "surrender").stderr)
        self.assertIn("practice options require", self.command("--practice", "pair").stderr)


if __name__ == "__main__":
    unittest.main()
