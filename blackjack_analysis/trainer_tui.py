from .game import Outcome, RoundStatus, Rules
from .strategy import Decision, Hand, StrategyType
from .trainer import TrainerSession

try:
    from textual import events
    from textual.app import App, ComposeResult
    from textual.binding import Binding
    from textual.containers import Horizontal
    from textual.screen import ModalScreen
    from textual.widgets import Static
except ImportError as exc:  # pragma: no cover - provides a useful source-checkout error
    raise SystemExit(
        "The trainer requires Textual. Run it with "
        "`uv run python -m blackjack_analysis --train`, or install the project "
        "with `python3 -m pip install -e .`."
    ) from exc


SHORTCUTS = {
    Decision.HIT: "h",
    Decision.STAND: "s",
    Decision.DOUBLE: "d",
    Decision.SPLIT: "p",
    Decision.SURRENDER: "r",
}


def _card_lines(card):
    if card is None:
        back = (
            "╭────────╮",
            "│░░░░░░░░│",
            "│░░░░░░░░│",
            "│░░░░░░░░│",
            "│░░░░░░░░│",
            "│░░░░░░░░│",
            "╰────────╯",
        )
        return tuple(f"[white on #244a8f]{line}[/]" for line in back)

    rank = card["rank"]
    suit = card["suit"]
    symbol = suit or "•"
    color = {"♠": "black", "♥": "red", "♦": "red", "♣": "black"}.get(suit, "black")
    corner = f"{rank}{symbol}"
    lines = (
        "╭────────╮",
        f"│{corner.ljust(8)}│",
        "│        │",
        "│        │",
        "│        │",
        f"│{corner.rjust(8)}│",
        "╰────────╯",
    )
    return tuple(f"[bold {color} on white]{line}[/]" for line in lines)


def render_cards(cards):
    rendered = [_card_lines(card) for card in cards]
    return "\n".join(
        "  ".join(card[row] for card in rendered)
        for row in range(len(rendered[0]))
    )


class InfoScreen(ModalScreen):
    CSS = """
    InfoScreen { align: center middle; background: #071b14 85%; }
    #overlay {
        width: 90%;
        height: 85%;
        border: round #24b47e;
        background: #0b2b20;
        padding: 1 2;
        overflow: auto;
    }
    """
    BINDINGS = [
        Binding("escape", "dismiss", "Back"), Binding("q,Q", "dismiss", "Back"),
        Binding("?", "help", "Help"), Binding("t,T", "chart", "Chart"),
        Binding("v,V", "summary", "Summary"),
        Binding("h,H", "hit", "Hit"), Binding("s,S", "stand", "Stand"),
        Binding("d,D", "double", "Double"), Binding("p,P", "split", "Split"),
        Binding("r,R", "surrender", "Surrender"),
        Binding("enter", "next_round", "Next round"),
    ]

    def __init__(self, content, view="help"):
        super().__init__()
        self.content = content
        self.view = view

    def compose(self) -> ComposeResult:
        yield Static(self.content, id="overlay", markup=False)

    def action_dismiss(self):
        self.dismiss()

    def _return_to_game(self, callback, *args):
        self.dismiss()
        self.app.call_later(callback, *args)

    def action_help(self):
        self.dismiss()
        if self.view != "help":
            self.app.call_later(self.app.action_help)

    def action_chart(self):
        self.dismiss()
        if self.view != "chart":
            self.app.call_later(self.app.action_chart)

    def action_summary(self):
        self.dismiss()
        if self.view != "summary":
            self.app.call_later(self.app.action_summary)

    def action_hit(self):
        self._return_to_game(self.app.action_hit)

    def action_stand(self):
        self._return_to_game(self.app.action_stand)

    def action_double(self):
        self._return_to_game(self.app.action_double)

    def action_split(self):
        self._return_to_game(self.app.action_split)

    def action_surrender(self):
        self._return_to_game(self.app.action_surrender)

    def action_next_round(self):
        self._return_to_game(self.app.action_next_round)


class SummaryScreen(InfoScreen):
    BINDINGS = [
        *(binding for binding in InfoScreen.BINDINGS if binding.key not in ("escape", "q,Q")),
        Binding("escape", "dismiss", "Continue"), Binding("q,Q", "quit", "Quit"),
    ]

    def action_quit(self):
        self.app.exit()


def strategy_chart(session):
    """Render the configured two-card basic-strategy table for reference."""
    dealer_cards = range(2, 12)
    header = "      " + " ".join(f"{('A' if card == 11 else card):>2}" for card in dealer_cards)
    sections = [
        ("HARD", [(str(total), (2, total - 2) if total < 12 else (10, total - 10))
                  for total in range(5, 21)]),
        ("SOFT", [(f"A{card}", (11, card)) for card in range(2, 10)]),
        ("PAIRS", [(str("A" if card == 11 else card) * 2, (card, card))
                   for card in range(2, 12)]),
    ]
    symbols = {
        Decision.HIT: "H", Decision.STAND: "S", Decision.DOUBLE: "D",
        Decision.SPLIT: "P", Decision.SURRENDER: "R",
    }
    lines = [
        "BASIC STRATEGY CHART", "H Hit  S Stand  D Double  P Split  R Surrender",
        "Uses current rules for two-card hands; later hits may change the move.", "",
    ]
    for name, rows in sections:
        lines.extend([name, header])
        for label, cards in rows:
            hand = Hand.from_cards(cards)
            moves = (
                symbols[session.strategy.decide(
                    dealer, hand,
                    can_split=name == "PAIRS" and session.rules.max_splits > 0
                    and (session.rules.resplit_aces or cards[0] != 11),
                )]
                for dealer in dealer_cards
            )
            lines.append(f"{label:>5} " + "  ".join(moves))
        lines.append("")
    lines.append("Esc or q: return to the game")
    return "\n".join(lines)


def session_summary(session):
    stats = session.stats
    lines = [
        "SESSION SUMMARY",
        f"Decisions: {stats.correct_decisions}/{stats.decisions} correct ({stats.accuracy:.1%})",
        f"Streak: {stats.current_streak}  Best: {stats.best_streak}",
        f"Rounds: {stats.rounds}  Hands: {stats.hands}",
        f"W/L/P: {stats.wins}/{stats.losses}/{stats.pushes}  Surrenders: {stats.surrenders}",
        f"Bankroll: ${session.bankroll:,.2f} ({session.bankroll - session.initial_bankroll:+,.2f})",
        "", "ACCURACY BY HAND",
    ]
    for kind in ("hard", "soft", "pair"):
        lines.append(f"{kind.title():<6} {stats.correct_by_kind[kind]}/{stats.decisions_by_kind[kind]} ({stats.accuracy_for(kind):.1%})")
    lines.extend(["", "FREQUENTLY MISSED SITUATIONS"])
    lines.extend(f"{situation}: {count}" for situation, count in stats.missed_situations.most_common(10))
    if not stats.missed_situations:
        lines.append("None yet")
    lines.extend(["", "Esc: continue practice   q: quit"])
    return "\n".join(lines)


class TrainerApp(App):
    TITLE = "Blackjack Basic Strategy Trainer"
    CSS = """
    Screen {
        background: #071b14;
        color: #e8f1ed;
        layout: vertical;
    }
    #top {
        height: 10;
        margin: 1 1 0 1;
    }
    #dealer, #stats, #hands, #feedback, #controls {
        border: round #24b47e;
        background: #0b2b20;
        padding: 0 1;
    }
    #dealer {
        width: 2fr;
        height: 100%;
    }
    #stats {
        width: 1fr;
        height: 100%;
        margin-left: 1;
    }
    #hands {
        height: 1fr;
        min-height: 3;
        margin: 1;
        overflow-y: auto;
    }
    #feedback {
        height: 3;
        margin: 0 1 1 1;
        content-align: center middle;
    }
    #feedback.correct { border: round #45d483; color: #8ef0b4; }
    #feedback.mistake { border: round #ef6262; color: #ffaaaa; }
    #feedback.illegal { border: round #e5b567; color: #ffe0a3; }
    #controls {
        height: 3;
        margin: 0 1 1 1;
        content-align: center middle;
    }
    Screen.narrow #top { height: 20; layout: vertical; }
    Screen.narrow #dealer, Screen.narrow #stats { width: 100%; }
    Screen.narrow #dealer { height: 10; }
    Screen.narrow #stats { height: 10; margin-left: 0; }
    """
    BINDINGS = [
        Binding("h,H", "hit", "Hit", show=True),
        Binding("s,S", "stand", "Stand", show=True),
        Binding("d,D", "double", "Double", show=True),
        Binding("p,P", "split", "Split", show=True),
        Binding("r,R", "surrender", "Surrender", show=True),
        Binding("enter", "next_round", "Next round", show=True),
        Binding("?", "help", "Help"),
        Binding("t,T", "chart", "Chart"),
        Binding("v,V", "summary", "Summary"),
        Binding("q,Q", "end_session", "End session"),
    ]

    def __init__(self, session=None, **kwargs):
        super().__init__(**kwargs)
        self.session = session or TrainerSession()

    def compose(self) -> ComposeResult:
        with Horizontal(id="top"):
            yield Static(id="dealer")
            yield Static(id="stats")
        yield Static(id="hands")
        yield Static(id="feedback")
        yield Static(id="controls")

    def on_mount(self):
        self._set_responsive_class(self.size.width)
        self.refresh_view()

    def on_resize(self, event: events.Resize):
        self._set_responsive_class(event.size.width)

    def _set_responsive_class(self, width):
        if width < 70:
            self.screen.add_class("narrow")
        else:
            self.screen.remove_class("narrow")

    def refresh_view(self):
        snapshot = self.session.snapshot()
        dealer = render_cards(snapshot["dealer_cards"])
        dealer_total = ""
        if snapshot["status"] == RoundStatus.COMPLETE.value:
            dealer_total = f"  ·  Total {self.session.round.dealer_hand.total}"
        self.query_one("#dealer", Static).update(f"[bold]DEALER{dealer_total}[/]\n{dealer}")

        stats = self.session.stats
        self.query_one("#stats", Static).update(
            "[bold]SESSION[/]\n"
            f"Accuracy  {stats.accuracy:6.1%}  ({stats.correct_decisions}/{stats.decisions})\n"
            f"Streak    {stats.current_streak}  ·  Best {stats.best_streak}\n"
            f"Rounds    {stats.rounds}  ·  W/L/P {stats.wins}/{stats.losses}/{stats.pushes}\n"
            f"Bankroll  ${self.session.bankroll:,.2f}\n"
            f"Hard {stats.correct_by_kind['hard']}/{stats.decisions_by_kind['hard']}  "
            f"Soft {stats.correct_by_kind['soft']}/{stats.decisions_by_kind['soft']}  "
            f"Pair {stats.correct_by_kind['pair']}/{stats.decisions_by_kind['pair']}\n"
            f"Missed    {stats.missed_situations.most_common(1)[0][0] if stats.missed_situations else 'none'}"
        )

        hand_sections = []
        for index, hand in enumerate(snapshot["hands"]):
            marker = "▶ " if hand["active"] else "  "
            softness = "soft" if hand["soft"] else "hard"
            hand_sections.append(
                f"[bold]{marker}HAND {index + 1} · {softness.upper()} {hand['total']} "
                f"· ${hand['bet']:,.0f}[/]\n{render_cards(hand['cards'])}"
            )
        if self.session.round.result is not None:
            labels = {
                Outcome.WIN: "WIN",
                Outcome.LOSS: "LOSS",
                Outcome.PUSH: "PUSH",
                Outcome.SURRENDER: "SURRENDER",
            }
            outcomes = " · ".join(labels[hand.outcome] for hand in self.session.round.result.hands)
            hand_sections.append(
                f"[bold]RESULT: {outcomes}  "
                f"({self.session.round.result.profit:+,.2f})[/]"
            )
        self.query_one("#hands", Static).update("\n\n".join(hand_sections))

        feedback = self.query_one("#feedback", Static)
        feedback.remove_class("correct", "mistake", "illegal")
        if self.session.feedback.illegal:
            feedback.add_class("illegal")
        elif self.session.feedback.correct is True:
            feedback.add_class("correct")
        elif self.session.feedback.correct is False:
            feedback.add_class("mistake")
        feedback.update(self.session.feedback.message)

        if snapshot["status"] == RoundStatus.COMPLETE.value:
            controls = "[bold]Enter[/bold] Next round    [bold]?[/bold] Help    [bold]t[/bold] Chart    [bold]v[/bold] Stats    [bold]q[/bold] End"
        else:
            available = self.session.available_actions
            controls = "    ".join(
                f"[bold]{key}[/bold] {action.value.title()}"
                if action in available
                else f"[dim]{key} {action.value.title()}[/dim]"
                for action, key in SHORTCUTS.items()
            )
            controls += "    [bold]?[/bold] Help  [bold]t[/bold] Chart  [bold]v[/bold] Stats  [bold]q[/bold] End"
        self.query_one("#controls", Static).update(controls)

    def action_help(self):
        self.push_screen(InfoScreen(
            "TRAINER HELP\n\n"
            "h Hit    s Stand    d Double    p Split    r Surrender\n"
            "Enter: next round after settlement\n"
            "t: strategy chart    v: session statistics    q: end session\n\n"
            "An active hand is marked ▶. A split hand is played before the next hand.\n"
            "Dim actions are unavailable. Accuracy counts legal decisions only.\n"
            "Use --practice to select opening hands. --require-correction asks you to retry\n"
            "a mistake; --delayed-feedback reveals mistakes when the round finishes.\n\n"
            "Esc or q: return to the game"
        ))

    def action_chart(self):
        self.push_screen(InfoScreen(strategy_chart(self.session), view="chart"))

    def action_summary(self):
        self.push_screen(SummaryScreen(session_summary(self.session), view="summary"))

    def action_end_session(self):
        self.action_summary()

    def _choose(self, decision):
        self.session.choose(decision)
        self.refresh_view()

    def action_hit(self):
        self._choose(Decision.HIT)

    def action_stand(self):
        self._choose(Decision.STAND)

    def action_double(self):
        self._choose(Decision.DOUBLE)

    def action_split(self):
        self._choose(Decision.SPLIT)

    def action_surrender(self):
        self._choose(Decision.SURRENDER)

    def action_next_round(self):
        if self.session.round.status is RoundStatus.COMPLETE:
            self.session.next_round()
        else:
            self.session.feedback = self.session.feedback.__class__(
                "Finish the current hand before starting another round.", illegal=True
            )
        self.refresh_view()


def run_trainer(strategy_type=StrategyType.STANDS_ON_SOFT_17, rules=None, bankroll=1_000, seed=None, bet=25,
                practice="all", require_correction=False, delayed_feedback=False):
    TrainerApp(
        TrainerSession(strategy_type, rules, bankroll=bankroll, bet=bet, seed=seed,
                       practice=practice, require_correction=require_correction,
                       delayed_feedback=delayed_feedback)
    ).run()


if __name__ == "__main__":
    run_trainer()
