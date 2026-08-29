import math
import shutil
import sys
import time


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

    def __init__(self, total, bankroll, stream=None):
        self.total = total
        self.initial_bankroll = bankroll
        self.stream = stream or sys.stdout
        self.interactive = getattr(self.stream, "isatty", lambda: False)()
        self.started = time.monotonic()
        self._last_render = self.started
        self.completed = 0
        self.profit = 0.0
        self.total_bet = 0.0
        self.rounds = self.hands = self.wins = self.losses = self.pushes = 0
        self.surrenders = self.blackjacks = 0
        self.min_bet = None
        self.max_bet = 0.0
        self.raised_bets = 0
        self.min_count = None
        self.max_count = None
        self.min_final_bankroll = None
        self.max_final_bankroll = None
        self.mean_profit = 0.0
        self.profit_m2 = 0.0
        self.convergence = []

    def _paint(self, text, color):
        return f"{color}{text}{RESET}" if self.interactive else text

    def _row(self, label, value, width, color=CYAN, label_width=0):
        content_width = width - 4
        content = f"{label}:".ljust(label_width + 2) + str(value)
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
        self.profit += result.profit
        delta = result.profit - self.mean_profit
        self.mean_profit += delta / completed
        self.profit_m2 += delta * (result.profit - self.mean_profit)
        self.total_bet += result.total_bet
        self.min_bet = result.min_bet if self.min_bet is None else min(self.min_bet, result.min_bet)
        self.max_bet = max(self.max_bet, result.max_bet)
        self.raised_bets += result.raised_bets
        self.min_count = result.min_count if self.min_count is None else min(self.min_count, result.min_count)
        self.max_count = result.max_count if self.max_count is None else max(self.max_count, result.max_count)
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
        self.rounds += result.rounds
        self.hands += result.hands
        self.wins += result.wins
        self.losses += result.losses
        self.pushes += result.pushes
        self.surrenders += result.surrenders
        self.blackjacks += result.blackjacks
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
        completed = final.simulations if final is not None else self.completed
        average_profit = final.average_profit if final is not None else (
            self.profit / completed if completed else 0.0
        )
        average_bankroll = (
            final.average_final_bankroll
            if final is not None
            else self.initial_bankroll + average_profit
        )
        average_bet = (
            final.average_bet
            if final is not None
            else self.total_bet / self.hands if self.hands else 0.0
        )
        stddev = (
            final.profit_stddev
            if final is not None
            else math.sqrt(self.profit_m2 / (completed - 1)) if completed > 1 else 0.0
        )
        if completed > 1:
            sample_stddev = stddev * math.sqrt(completed / (completed - 1))
            confidence_margin = 1.96 * sample_stddev / math.sqrt(completed)
        else:
            confidence_margin = 0.0
        rounds = final.rounds if final is not None else self.rounds
        hands = final.hands if final is not None else self.hands
        wins = final.wins if final is not None else self.wins
        losses = final.losses if final is not None else self.losses
        pushes = final.pushes if final is not None else self.pushes
        surrenders = final.surrenders if final is not None else self.surrenders
        blackjacks = final.blackjacks if final is not None else self.blackjacks

        elapsed = elapsed if elapsed is not None else time.monotonic() - self.started
        rate = completed / elapsed if elapsed else 0.0
        win_rate = wins / hands if hands else 0.0
        loss_rate = losses / hands if hands else 0.0
        push_rate = pushes / hands if hands else 0.0
        percent = completed / self.total if self.total else 1.0
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
        min_final_bankroll = (
            final.min_final_bankroll if final is not None else self.min_final_bankroll
        )
        max_final_bankroll = (
            final.max_final_bankroll if final is not None else self.max_final_bankroll
        )
        range_text = (
            f"${min_final_bankroll:,.0f} - ${max_final_bankroll:,.0f}"
            if min_final_bankroll is not None
            else "pending"
        )
        min_bet = final.min_bet if final is not None else self.min_bet
        max_bet = final.max_bet if final is not None else self.max_bet
        raised_bets = final.raised_bets if final is not None else self.raised_bets
        min_count = final.min_count if final is not None else self.min_count
        max_count = final.max_count if final is not None else self.max_count
        bet_range = (
            f"${min_bet:,.0f} - ${max_bet:,.0f}"
            if min_bet is not None
            else "pending"
        )
        total_bet = final.total_bet if final is not None else self.total_bet
        total_profit = average_profit * completed
        return_on_action = total_profit / total_bet if total_bet else 0.0
        raised_rate = raised_bets / rounds if rounds else 0.0
        count_range = (
            f"{min_count:+d} to {max_count:+d}"
            if min_count is not None
            else "pending"
        )
        if completed and (not self.convergence or self.convergence[-1] != average_profit):
            self.convergence.append(average_profit)
        status_color = GREEN if status == "COMPLETE" else CYAN

        lines = [
            self._paint("BLACKJACK ANALYSIS", BOLD + CYAN),
            self._paint(f"● {status}", BOLD + status_color)
            + self._paint(f"   {completed:,} / {self.total:,} simulations", DIM),
            "",
            *self._box(
                f"PROGRESS {percent:6.1%}",
                [(None, bar, GREEN)],
                full_width,
            ),
            "",
        ]
        boxes = [
            self._box(
                "SIMULATION",
                [
                    ("Completed", f"{completed:,} / {self.total:,}", CYAN),
                    ("Rounds", f"{rounds:,}", BLUE),
                    ("Elapsed", f"{elapsed:,.1f}s", CYAN),
                    ("Speed", f"{rate:,.0f} sim/s", CYAN),
                ],
                panel_width,
                height=5,
            ),
            self._box(
                "BANKROLL",
                [
                    ("Avg profit", f"${average_profit:,.2f}", GREEN if average_profit >= 0 else RED),
                    ("Avg bankroll", f"${average_bankroll:,.2f}", GREEN),
                    ("95% CI", f"±${confidence_margin:,.2f}", GREEN),
                    ("Avg bet", f"${average_bet:,.2f}", YELLOW),
                    ("Final range", range_text, DIM),
                ],
                panel_width,
                height=5,
            ),
            self._box(
                "OUTCOMES",
                [
                    ("Hands", f"{hands:,}", CYAN),
                    ("Wins", f"{wins:,}", GREEN),
                    ("Losses", f"{losses:,}", RED),
                    ("Pushes", f"{pushes:,}", YELLOW),
                ],
                panel_width,
                height=5,
            ),
            self._box(
                "RATES & SPECIALS",
                [
                    ("Win rate", f"{win_rate:.2%}", GREEN),
                    ("Loss rate", f"{loss_rate:.2%}", RED),
                    ("Push rate", f"{push_rate:.2%}", YELLOW),
                    ("Blackjacks", f"{blackjacks:,}", MAGENTA),
                    ("Surrenders", f"{surrenders:,}", BLUE),
                ],
                panel_width,
                height=5,
            ),
        ]
        if columns >= 60:
            for left, right in zip(boxes[::2], boxes[1::2]):
                height = max(len(left), len(right))
                left += [" " * panel_width] * (height - len(left))
                right += [" " * panel_width] * (height - len(right))
                lines.extend(" ".join(pair) for pair in zip(left, right))
        else:
            for box in boxes:
                lines.extend(box)
                lines.append("")

        sparkline = self._sparkline(self.convergence, max(10, full_width - 28))
        lines.extend(
            [
                "",
                *self._box(
                    "LIVE METRICS",
                    [
                        ("Avg profit/shoe", f"${average_profit:,.2f}  {sparkline}", GREEN if average_profit >= 0 else RED),
                        ("Wagering", f"Total: ${total_bet:,.0f}  Range: {bet_range}  Return/action: {return_on_action:+.2%}  Raised: {raised_rate:.1%}  Count: {count_range}", YELLOW),
                    ],
                    full_width,
                ),
            ]
        )
        if final is not None:
            lines.append(self._paint(f"Profit standard deviation: ${stddev:,.2f}", DIM))
        prefix = "\x1b[2J\x1b[H" if self.interactive else ""
        self.stream.write(prefix + "\n".join(lines) + "\n")
        self.stream.flush()
        self._last_render = time.monotonic()

    def finish(self, result):
        self.render("COMPLETE", result, time.monotonic() - self.started)
