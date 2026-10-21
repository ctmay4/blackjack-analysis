import unittest

from blackjack_analysis.game import Rules
from blackjack_analysis.strategy import Decision
from blackjack_analysis.trainer import TrainerSession
from blackjack_analysis.trainer_tui import InfoScreen, SummaryScreen, TrainerApp, render_cards, session_summary, strategy_chart


class TrainerTuiTests(unittest.IsolatedAsyncioTestCase):
    def test_card_renderer_draws_face_and_hidden_cards(self):
        rendered = render_cards([
            {"rank": "A", "suit": "♥", "value": 11},
            None,
        ])
        self.assertIn("A", rendered)
        self.assertIn("♥", rendered)
        self.assertIn("░", rendered)
        self.assertIn("on white", rendered)
        self.assertEqual(rendered.count("A♥"), 2)
        self.assertEqual(len(rendered.splitlines()), 7)

        ten = render_cards([{"rank": "10", "suit": "♠", "value": 10}])
        self.assertEqual(ten.count("10♠"), 2)

        red_diamond = render_cards([{"rank": "A", "suit": "♦", "value": 11}])
        black_club = render_cards([{"rank": "A", "suit": "♣", "value": 11}])
        self.assertIn("[bold red on white]", red_diamond)
        self.assertIn("[bold black on white]", black_club)

    async def test_wide_top_panels_have_matching_heights(self):
        session = TrainerSession(
            rules=Rules(penetration=0.99),
            shoe=[7, 6, 10, 10],
        )
        app = TrainerApp(session)
        async with app.run_test(size=(100, 35)) as pilot:
            await pilot.pause()
            dealer = app.query_one("#dealer")
            stats = app.query_one("#stats")
            self.assertEqual(dealer.region.height, stats.region.height)

    async def test_shortcut_plays_choice_and_updates_screen(self):
        session = TrainerSession(
            rules=Rules(penetration=0.99),
            shoe=[7, 6, 10, 10],
        )
        app = TrainerApp(session)
        async with app.run_test(size=(100, 35)) as pilot:
            await pilot.press("s")
            await pilot.pause()
            self.assertEqual(session.stats.decisions, 1)
            self.assertIsNotNone(session.round.result)
            self.assertIn("Your choice was played", session.feedback.message)
            self.assertTrue(app.query_one("#feedback").has_class("mistake"))

    async def test_split_keeps_actions_visible_for_first_hand(self):
        session = TrainerSession(
            rules=Rules(penetration=0.99),
            shoe=[5, 2, 3, 10, 8, 8, 6],
        )
        app = TrainerApp(session)
        async with app.run_test(size=(100, 30)) as pilot:
            await pilot.press("p")
            await pilot.pause()

            self.assertIn(Decision.HIT, session.available_actions)
            controls = app.query_one("#controls")
            self.assertLessEqual(controls.region.bottom, app.size.height)

    async def test_narrow_screen_switches_layout_class(self):
        session = TrainerSession(
            rules=Rules(penetration=0.99),
            shoe=[7, 6, 10, 10],
        )
        app = TrainerApp(session)
        async with app.run_test(size=(60, 35)) as pilot:
            await pilot.pause()
            self.assertTrue(app.screen.has_class("narrow"))

    async def test_help_chart_and_end_of_session_summary(self):
        session = TrainerSession(rules=Rules(penetration=0.99), shoe=[7, 6, 10, 10])
        app = TrainerApp(session)
        async with app.run_test(size=(100, 35)) as pilot:
            await pilot.press("?")
            self.assertIsInstance(app.screen, InfoScreen)
            await pilot.press("escape")
            await pilot.press("T")
            self.assertIsInstance(app.screen, InfoScreen)
            self.assertIn("PAIRS", strategy_chart(session))
            await pilot.press("escape")
            await pilot.press("s")
            await pilot.press("q")
            self.assertIsInstance(app.screen, SummaryScreen)
            self.assertIn("hard 16 vs 10", session_summary(session))
            await pilot.press("escape")
            self.assertNotIsInstance(app.screen, InfoScreen)

    async def test_shortcuts_still_work_after_opening_help(self):
        session = TrainerSession(rules=Rules(penetration=0.99), shoe=[10, 7, 2, 11, 10])
        app = TrainerApp(session)
        async with app.run_test(size=(100, 35)) as pilot:
            await pilot.press("?")
            self.assertIsInstance(app.screen, InfoScreen)
            await pilot.press("t")
            await pilot.pause()
            self.assertEqual(app.screen.view, "chart")
            await pilot.press("?")
            await pilot.pause()
            self.assertEqual(app.screen.view, "help")
            await pilot.press("H")
            await pilot.pause()
            self.assertNotIsInstance(app.screen, InfoScreen)
            self.assertEqual(session.stats.decisions, 1)
            self.assertEqual(session.round.active_hand.total, 13)
            await pilot.press("?")
            await pilot.press("Q")
            await pilot.pause()
            self.assertNotIsInstance(app.screen, InfoScreen)
            await pilot.press("v")
            self.assertIsInstance(app.screen, SummaryScreen)
            await pilot.press("escape")
            self.assertNotIsInstance(app.screen, InfoScreen)

    async def test_hit_key_works_without_an_overlay(self):
        session = TrainerSession(rules=Rules(penetration=0.99), shoe=[10, 7, 2, 11, 10])
        app = TrainerApp(session)
        async with app.run_test(size=(100, 35)) as pilot:
            self.assertIn(Decision.HIT, session.available_actions)
            await pilot.press("h")
            await pilot.pause()
            self.assertEqual(session.stats.decisions, 1)
            self.assertEqual(session.round.active_hand.total, 13)

    async def test_uppercase_hit_key_works_without_an_overlay(self):
        session = TrainerSession(rules=Rules(penetration=0.99), shoe=[10, 7, 2, 11, 10])
        app = TrainerApp(session)
        async with app.run_test(size=(100, 35)) as pilot:
            await pilot.press("H")
            await pilot.pause()
            self.assertEqual(session.stats.decisions, 1)
            self.assertEqual(session.round.active_hand.total, 13)

    def test_chart_and_summary_reflect_rules_and_accuracy(self):
        session = TrainerSession(rules=Rules(penetration=0.99, allow_surrender=True), shoe=[7, 6, 10, 10])
        chart = strategy_chart(session)
        self.assertIn("H Hit  S Stand  D Double  P Split  R Surrender", chart)
        self.assertIn("HARD", chart)
        self.assertIn("SOFT", chart)
        self.assertIn("PAIRS", chart)
        session.choose(Decision.STAND)
        summary = session_summary(session)
        self.assertIn("0/1 correct", summary)
        self.assertIn("hard 16 vs 10: 1", summary)


if __name__ == "__main__":
    unittest.main()
