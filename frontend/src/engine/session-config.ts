import { DEFAULT_RULES, tableRules } from "./types";
import { PRACTICE_MODES } from "./session-types";
import type { Config, FeedbackMode, PracticeMode } from "./session-types";
import type { Rules } from "./types";

export const defaults: Config = Object.freeze({
  rules: Object.freeze({ ...DEFAULT_RULES, decks: 6 }),
  bankroll: 1000,
  bet: 25,
  practice: "all",
  feedback_mode: "immediate",
});

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(`${name} must be a plain object`);
  return value as Record<string, unknown>;
}
function knownKeys(
  value: Record<string, unknown>,
  keys: string[],
  name: string,
) {
  for (const key of Object.keys(value))
    if (!keys.includes(key)) throw new Error(`Unknown ${name} field: ${key}`);
}
function amount(
  value: unknown,
  fallback: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > maximum
  )
    throw new Error(`${name} must be positive, finite, and at most ${maximum}`);
  return value;
}
/** Strict runtime boundary for settings now and browser storage/JSON later. */
export function sessionConfig(input: unknown = {}): Config {
  const value = record(input, "Session configuration");
  knownKeys(
    value,
    ["rules", "bankroll", "bet", "practice", "feedback_mode"],
    "session",
  );
  const ruleInput =
    value.rules === undefined ? {} : record(value.rules, "Rules");
  knownKeys(ruleInput, Object.keys(DEFAULT_RULES), "rules");
  const rules = tableRules({
    ...defaults.rules,
    ...ruleInput,
  } as Partial<Rules>);
  if (rules.decks > 8 || rules.max_splits > 3)
    throw new Error("The trainer supports 1–8 decks and 0–3 splits");
  const practice =
    value.practice === undefined ? defaults.practice : value.practice;
  if (
    typeof practice !== "string" ||
    !PRACTICE_MODES.includes(practice as PracticeMode)
  )
    throw new Error("Unknown practice mode");
  const feedback =
    value.feedback_mode === undefined
      ? defaults.feedback_mode
      : value.feedback_mode;
  if (!["immediate", "correction", "delayed"].includes(feedback as string))
    throw new Error("Unknown feedback mode");
  if (practice === "pair" && rules.max_splits === 0)
    throw new Error("Pair practice requires splitting to be enabled.");
  if (practice === "surrender" && !rules.allow_surrender)
    throw new Error(
      "Surrender practice requires late surrender to be enabled.",
    );
  return {
    rules: { ...rules },
    bankroll: amount(
      value.bankroll,
      defaults.bankroll,
      1_000_000_000,
      "bankroll",
    ),
    bet: amount(value.bet, defaults.bet, 1_000_000, "bet"),
    practice: practice as PracticeMode,
    feedback_mode: feedback as FeedbackMode,
  };
}
