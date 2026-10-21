import math
import shutil
import sys
import time

from .blackjack import percentile

RESET = "\x1b[0m"
BOLD = "\x1b[1m"
DIM = "\x1b[2m"
CYAN = "\x1b[36m"
BLUE = "\x1b[34m"
GREEN = "\x1b[32m"
YELLOW = "\x1b[33m"
RED = "\x1b[31m"
MAGENTA = "\x1b[35m"


class ProgressDisplay:
    """Small dependency-free dashboard for a running simulation."""

    def __init__(self, total, bankroll, stream=None, strategy="unknown"):
        self.total = total
        self.initial_bankroll = bankroll
        self.strategy = strategy
        self.stream = stream or sys.stdout
        self.interactive = getattr(self.stream, "isatty", lambda: False)()
        self.started = time.monotonic()
        self._last_render = self.started
        self.completed = 0
        self.profit = 0.0
        self.profits = []
        self.total_bet = 0.0
        self.initial_bet_total = 0.0
        self.rounds = self.hands = self.wins = self.losses = self.pushes = 0
        self.surrenders = self.blackjacks = 0
        self.hits = self.stands = self.doubles = self.splits = 0
        self.player_busts = self.dealer_busts = self.dealer_blackjacks = 0
        self.dealer_resolved_rounds = 0
        self.min_bet = self.min_initial_bet = None
        self.max_bet = self.max_initial_bet = 0.0
        self.raised_bets = 0
        self.min_count = self.max_count = None
        self.count_total = 0
        self.min_final_bankroll = self.max_final_bankroll = None
        self.min_bankroll = None
        self.max_drawdown = self.average_max_drawdown = 0.0
        self.profitable_simulations = self.losing_simulations = 0
        self.breakeven_simulations = 0
        self.mean_profit = 0.0
        self.profit_m2 = 0.0
        self.convergence = []
        self.convergence_step = max(1, total // 100)
        self.next_convergence = self.convergence_step

    def _paint(self, text, color):
        return f"{color}{text}{RESET}" if self.interactive else text

    def _row(self, label, value, width, color=CYAN, label_width=0):
        content_width = width - 4
        content = (
            f"{label}: {value}"
            if width < 40
            else f"{label}:".ljust(label_width + 2) + str(value)
        )
        content = content[:content_width].ljust(content_width)
        return (
            self._paint("│ ", CYAN)
            + self._paint(content, color)
            + self._paint(" │", CYAN)
        )

    def _edge_row(self, value, width, color):
        content = str(value)[: width - 2].ljust(width - 2)
        return self._paint("│", CYAN) + self._paint(content, color) + self._paint("│", CYAN)

    def _box(self, title, rows, width, height=None):
        title = title[: max(1, width - 5)]
        dash_count = max(0, width - len(title) - 5)
        lines = [self._paint(f"╭─ {title} {'─' * dash_count}╮", CYAN)]
        rows = list(rows)
        label_width = max((len(row[0]) for row in rows if row is not None and row[0]), default=0)
        rows.extend([None] * max(0, (height or len(rows)) - len(rows)))
        for row in rows:
            lines.append(
                self._paint("│", CYAN) + " " * (width - 2) + self._paint("│", CYAN)
                if row is None
                else self._edge_row(row[1], width, row[2])
                if row[0] is None
                else self._row(row[0], row[1], width, row[2], label_width)
            )
        lines.append(self._paint("╰" + "─" * (width - 2) + "╯", CYAN))
        return lines

    def update(self, completed, result):
        self.completed = completed
        self.profits.append(result.profit)
        self.profit += result.profit
        delta = result.profit - self.mean_profit
        self.mean_profit += delta / completed
        self.profit_m2 += delta * (result.profit - self.mean_profit)
        self.total_bet += result.total_bet
        self.initial_bet_total += result.initial_bet_total
        self.min_bet = result.min_bet if self.min_bet is None else min(self.min_bet, result.min_bet)
        self.max_bet = max(self.max_bet, result.max_bet)
        self.min_initial_bet = (
            result.min_initial_bet
            if self.min_initial_bet is None
            else min(self.min_initial_bet, result.min_initial_bet)
        )
        self.max_initial_bet = max(self.max_initial_bet, result.max_initial_bet)
        self.raised_bets += result.raised_bets
        self.min_count = result.min_count if self.min_count is None else min(self.min_count, result.min_count)
        self.max_count = result.max_count if self.max_count is None else max(self.max_count, result.max_count)
        self.count_total += result.count_total
        self.min_final_bankroll = (
            result.final_bankroll
            if self.min_final_bankroll is None
            else min(self.min_final_bankroll, result.final_bankroll)
        )
        self.max_final_bankroll = (
            result.final_bankroll
            if self.max_final_bankroll is None
            else max(self.max_final_bankroll, result.final_bankroll)
        )
        self.min_bankroll = result.min_bankroll if self.min_bankroll is None else min(self.min_bankroll, result.min_bankroll)
        self.max_drawdown = max(self.max_drawdown, result.max_drawdown)
        self.average_max_drawdown += (result.max_drawdown - self.average_max_drawdown) / completed
        self.profitable_simulations += result.profit > 0
        self.losing_simulations += result.profit < 0
        self.breakeven_simulations += result.profit == 0
        self.rounds += result.rounds
        self.hands += result.hands
        self.wins += result.wins
        self.losses += result.losses
        self.pushes += result.pushes
        self.surrenders += result.surrenders
        self.blackjacks += result.blackjacks
        self.hits += result.hits
        self.stands += result.stands
        self.doubles += result.doubles
        self.splits += result.splits
        self.player_busts += result.player_busts
        self.dealer_busts += result.dealer_busts
        self.dealer_blackjacks += result.dealer_blackjacks
        self.dealer_resolved_rounds += result.dealer_resolved_rounds
        if completed == self.next_convergence or completed == self.total:
            self.convergence.append(self.profit / completed)
            self.next_convergence += self.convergence_step
        if self.interactive and time.monotonic() - self._last_render >= 0.1:
            self.render()

    def _sparkline(self, values, width):
        values = values[-width:]
        if not values:
            return " " * width
        low, high = min(values), max(values)
        levels = "▁▂▃▄▅▆▇█"
        if low == high:
            return levels[len(levels) // 2] * len(values)
        return "".join(
            levels[min(len(levels) - 1, int((value - low) / (high - low) * len(levels)))]
            for value in values
        ).rjust(width)

    def render(self, status="RUNNING", final=None, elapsed=None):
        def value(name):
            return getattr(final, name) if final is not None else getattr(self, name)

        completed = final.simulations if final is not None else self.completed
        average_profit = final.average_profit if final is not None else self.profit / completed if completed else 0.0
        average_bankroll = final.average_final_bankroll if final is not None else self.initial_bankroll + average_profit
        rounds = value("rounds")
        hands = value("hands")
        wins = value("wins")
        losses = value("losses")
        pushes = value("pushes")
        surrenders = value("surrenders")
        blackjacks = value("blackjacks")
        resolved_hands = hands - surrenders
        stddev = final.profit_stddev if final is not None else math.sqrt(self.profit_m2 / completed) if completed > 1 else 0.0
        if completed > 1:
            sample_stddev = stddev * math.sqrt(completed / (completed - 1))
            confidence_margin = 1.96 * sample_stddev / math.sqrt(completed)
        else:
            confidence_margin = 0.0

        elapsed = elapsed if elapsed is not None else time.monotonic() - self.started
        rate = completed / elapsed if elapsed else 0.0
        eta = (self.total - completed) / rate if rate and completed < self.total else 0.0
        percent = completed / self.total if self.total else 1.0
        total_profit = average_profit * completed
        total_bet = value("total_bet")
        initial_bet_total = value("initial_bet_total")
        min_bet = value("min_bet")
        max_bet = value("max_bet")
        min_initial_bet = value("min_initial_bet")
        max_initial_bet = value("max_initial_bet")
        min_count = value("min_count")
        max_count = value("max_count")
        count_total = value("count_total")
        raised_bets = value("raised_bets")
        min_final_bankroll = value("min_final_bankroll")
        max_final_bankroll = value("max_final_bankroll")
        min_bankroll = value("min_bankroll")
        min_bankroll = self.initial_bankroll if min_bankroll is None else min_bankroll
        max_drawdown = value("max_drawdown")
        average_max_drawdown = value("average_max_drawdown")
        dealer_resolved_rounds = value("dealer_resolved_rounds")
        profitable = value("profitable_simulations")
        roi = total_profit / total_bet if total_bet else 0.0
        avg_initial_bet = initial_bet_total / rounds if rounds else 0.0
        avg_count = count_total / rounds if rounds else 0.0
        profit_per_100_hands = total_profit * 100 / hands if hands else 0.0
        profit_per_100_rounds = total_profit * 100 / rounds if rounds else 0.0
        win_rate = wins / resolved_hands if resolved_hands else 0.0
        loss_rate = losses / resolved_hands if resolved_hands else 0.0
        push_rate = pushes / resolved_hands if resolved_hands else 0.0
        surrender_rate = surrenders / hands if hands else 0.0
        profitable_rate = profitable / completed if completed else 0.0
        range_text = f"${min_final_bankroll:,.0f} - ${max_final_bankroll:,.0f}" if min_final_bankroll is not None else "pending"
        bet_range = f"${min_bet:,.0f} - ${max_bet:,.0f}" if min_bet is not None else "pending"
        initial_bet_range = f"${min_initial_bet:,.0f} - ${max_initial_bet:,.0f}" if min_initial_bet is not None else "pending"
        count_range = f"{min_count:+d} to {max_count:+d}" if min_count is not None else "pending"
        profit_p05 = final.profit_p05 if final is not None else percentile(self.profits, 0.05) if self.profits else 0.0
        profit_median = final.profit_median if final is not None else percentile(self.profits, 0.5) if self.profits else 0.0
        profit_p95 = final.profit_p95 if final is not None else percentile(self.profits, 0.95) if self.profits else 0.0
        ci_color = GREEN if completed > 1 and average_profit - confidence_margin > 0 else RED if completed > 1 and average_profit + confidence_margin < 0 else YELLOW

        columns = shutil.get_terminal_size((100, 24)).columns
        if columns >= 60:
            panel_width = max(24, (columns - 1) // 2)
            full_width = panel_width * 2 + 1
        else:
            full_width = max(24, columns - 2)
            panel_width = full_width
        bar_width = max(10, full_width - 2)
        filled = min(bar_width, int(bar_width * percent))
        bar = "█" * filled + "░" * (bar_width - filled)
        status_color = GREEN if status == "COMPLETE" else CYAN
        lines = [
            self._paint("BLACKJACK ANALYSIS", BOLD + CYAN),
            self._paint(f"● {status}", BOLD + status_color)
            + self._paint(f"   {self.strategy}   {completed:,} / {self.total:,} simulations", DIM),
            "",
            *self._box(f"PROGRESS {percent:6.1%}", [(None, bar, GREEN)], full_width),
            "",
        ]
        panels = [
            ("SIMULATION", [
                ("Completed", f"{completed:,} / {self.total:,}", CYAN),
                ("Rounds", f"{rounds:,}", BLUE),
                ("Hands", f"{hands:,}", BLUE),
                ("Speed", f"{rate:,.0f} sim/s", CYAN),
                ("ETA", f"{eta:,.1f}s", DIM),
            ]),
            ("BANKROLL", [
                ("Avg profit", f"${average_profit:,.2f}", GREEN if average_profit >= 0 else RED),
                ("Avg bankroll", f"${average_bankroll:,.2f}", GREEN),
                ("Approx. 95% CI", f"±${confidence_margin:,.2f}" if completed > 1 else "pending", ci_color),
                ("Profit σ", f"${stddev:,.2f}", DIM),
                ("p05/p50/p95", f"${profit_p05:,.0f} / ${profit_median:,.0f} / ${profit_p95:,.0f}", DIM),
                ("Worst drawdown", f"${max_drawdown:,.2f}", RED if max_drawdown else GREEN),
                ("Lowest bankroll", f"${min_bankroll:,.2f}", RED if min_bankroll < self.initial_bankroll else GREEN),
            ]),
            ("OUTCOMES", [
                ("Wins", f"{wins:,}", GREEN),
                ("Losses", f"{losses:,}", RED),
                ("Pushes", f"{pushes:,}", YELLOW),
                ("Surrenders", f"{surrenders:,}", BLUE),
                ("Blackjacks", f"{blackjacks:,}", MAGENTA),
                ("Player busts", f"{value('player_busts'):,}", RED),
                ("Dealer busts", f"{value('dealer_busts'):,}", GREEN),
                ("Dealer blackjacks", f"{value('dealer_blackjacks'):,}", MAGENTA),
            ]),
            ("RATES", [
                ("Win / loss / push", f"{win_rate:.2%} / {loss_rate:.2%} / {push_rate:.2%}", CYAN),
                ("Surrender rate", f"{surrender_rate:.2%}", BLUE),
                ("Blackjack rate", f"{blackjacks / rounds if rounds else 0.0:.2%}", MAGENTA),
                ("Player bust rate", f"{value('player_busts') / hands if hands else 0.0:.2%}", RED),
                ("Dealer bust rate", f"{value('dealer_busts') / dealer_resolved_rounds if dealer_resolved_rounds else 0.0:.2%}", GREEN),
                ("Profitable shoes", f"{profitable_rate:.2%}", GREEN if profitable_rate >= 0.5 else RED),
                ("Resolved hands", f"{resolved_hands:,}", DIM),
            ]),
            ("WAGERING & COUNTING", [
                ("Total wagered", f"${total_bet:,.0f}", YELLOW),
                ("Avg initial bet", f"${avg_initial_bet:,.2f}", YELLOW),
                ("Initial bet range", initial_bet_range, DIM),
                ("Avg wager / hand", f"${total_bet / hands if hands else 0.0:,.2f}", YELLOW),
                ("Wager range", bet_range, DIM),
                ("Return on wager", f"{roi:+.2%}", GREEN if roi >= 0 else RED),
                ("Raised bets", f"{raised_bets / rounds if rounds else 0.0:.1%}", YELLOW),
                ("Count avg/range", f"{avg_count:+.2f} / {count_range}", CYAN),
            ]),
            ("ACTIONS", [
                ("Hits", f"{value('hits'):,}", CYAN),
                ("Stands", f"{value('stands'):,}", CYAN),
                ("Doubles", f"{value('doubles'):,}", YELLOW),
                ("Splits", f"{value('splits'):,}", MAGENTA),
                ("Total decisions", f"{value('hits') + value('stands') + value('doubles') + value('splits') + surrenders:,}", DIM),
                ("Avg max drawdown", f"${average_max_drawdown:,.2f}", RED if average_max_drawdown else GREEN),
                ("Final range", range_text, DIM),
            ]),
        ]
        if columns >= 60:
            for left_panel, right_panel in zip(panels[::2], panels[1::2]):
                row_height = max(len(left_panel[1]), len(right_panel[1]))
                left = self._box(*left_panel, panel_width, height=row_height)
                right = self._box(*right_panel, panel_width, height=row_height)
                lines.extend(" ".join(pair) for pair in zip(left, right))
        else:
            for panel in panels:
                lines.extend(self._box(*panel, panel_width))
                lines.append("")

        sparkline = self._sparkline(self.convergence, max(10, full_width - 4))
        lines.extend([
            "",
            *self._box("CONVERGENCE", [
                ("Profit / 100 hands", f"${profit_per_100_hands:,.2f}", GREEN if profit_per_100_hands >= 0 else RED),
                ("Profit / 100 rounds", f"${profit_per_100_rounds:,.2f}", GREEN if profit_per_100_rounds >= 0 else RED),
                ("Profitable shoes", f"{profitable:,} / {completed:,} ({profitable_rate:.2%})", GREEN if profitable_rate >= 0.5 else RED),
                (None, sparkline, GREEN if average_profit >= 0 else RED),
            ], full_width),
        ])
        prefix = "\x1b[2J\x1b[H" if self.interactive else ""
        self.stream.write(prefix + "\n".join(lines) + "\n")
        self.stream.flush()
        self._last_render = time.monotonic()

    def finish(self, result):
        self.render("COMPLETE", result, time.monotonic() - self.started)
