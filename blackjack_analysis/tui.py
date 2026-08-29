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
        self.total_bet += result.total_bet
        self.rounds += result.rounds
        self.hands += result.hands
        self.wins += result.wins
        self.losses += result.losses
        self.pushes += result.pushes
        self.surrenders += result.surrenders
        self.blackjacks += result.blackjacks
        if self.interactive and time.monotonic() - self._last_render >= 0.1:
            self.render()

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
        range_text = (
            f"${final.min_final_bankroll:,.0f} - ${final.max_final_bankroll:,.0f}"
            if final is not None
            else "pending"
        )
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

        if final is not None:
            lines.extend(
                [
                    "",
                    self._paint(
                        f"Profit standard deviation: ${final.profit_stddev:,.2f}", DIM
                    ),
                ]
            )
        prefix = "\x1b[2J\x1b[H" if self.interactive else ""
        self.stream.write(prefix + "\n".join(lines) + "\n")
        self.stream.flush()
        self._last_render = time.monotonic()

    def finish(self, result):
        self.render("COMPLETE", result, time.monotonic() - self.started)
