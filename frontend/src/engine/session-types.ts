import type { Action, CardData, Outcome, Recommendation, Rules } from "./types";

export const PRACTICE_MODES = [
  "all",
  "hard",
  "soft",
  "pair",
  "surrender",
  "missed",
] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];
export type FeedbackMode = "immediate" | "correction" | "delayed";
export interface Config {
  rules: Rules;
  bankroll: number;
  bet: number;
  practice: PracticeMode;
  feedback_mode: FeedbackMode;
}
export interface Feedback {
  message: string;
  chosen: Action | null;
  recommendation: Recommendation | null;
  correct: boolean | null;
  illegal: boolean;
}
/** Public presentation state: never contains a shoe, hole card, or pending hints. */
export interface SessionSnapshot {
  status: "player_turn" | "complete";
  round_number: number;
  round_profit: number | null;
  dealer_total: number | null;
  config: Config;
  dealer_cards: (CardData | null)[];
  hands: {
    cards: CardData[];
    total: number;
    soft: boolean;
    active: boolean;
    bet: number;
    finished: boolean;
    outcome: Outcome | null;
    profit: number | null;
  }[];
  available_actions: Action[];
  feedback: string;
  feedback_detail: {
    correct: boolean | null;
    illegal: boolean;
    chosen: Action | null;
    recommendation: Action | null;
  };
  bankroll: number;
  stats: {
    decisions: number;
    correct: number;
    accuracy: number;
    current_streak: number;
    best_streak: number;
    rounds: number;
    hands: number;
    wins: number;
    losses: number;
    pushes: number;
    surrenders: number;
    breakdown: {
      kind: string;
      decisions: number;
      correct: number;
      accuracy: number;
    }[];
    missed_situations: { situation: string; count: number }[];
  };
}
/** Revision belongs to the controller/adapter, not the training rules. */
export interface SessionToken {
  session_id: string;
  revision: number;
}
export interface Snapshot extends SessionSnapshot, SessionToken {}
export interface ChartSection {
  name: string;
  rows: { label: string; actions: Action[] }[];
}
