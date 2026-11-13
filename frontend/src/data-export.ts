import type { SessionHistory } from "./session-history";

/** Quote every field and neutralize spreadsheet formulas, including leading whitespace. */
export function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safe =
    typeof value === "string" && /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function historyCsv(history: SessionHistory): string {
  const rows: (string | number | null)[][] = [
    [
      "session_id",
      "started_at",
      "ended_at",
      "reason",
      "practice",
      "feedback",
      "decisions",
      "correct_decisions",
      "accuracy",
      "settled_rounds",
      "settled_profit",
      "partial_review",
    ],
  ];
  for (const session of history.sessions) {
    rows.push([
      session.id,
      session.startedAt === null
        ? null
        : new Date(session.startedAt).toISOString(),
      session.endedAt === null ? null : new Date(session.endedAt).toISOString(),
      session.reason,
      session.config.practice,
      session.config.feedback_mode,
      session.stats.decisions,
      session.stats.correctDecisions,
      session.stats.decisions
        ? session.stats.correctDecisions / session.stats.decisions
        : null,
      session.stats.rounds,
      session.bankroll - session.config.bankroll,
      session.partial ? "yes" : "no",
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
