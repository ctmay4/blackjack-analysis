export type Action = "hit" | "stand" | "double" | "split" | "surrender";
export interface Rules {
  decks: number;
  penetration: number;
  dealer_hits_soft_17: boolean;
  allow_surrender: boolean;
  double_after_split: boolean;
  max_splits: number;
  resplit_aces: boolean;
  one_card_on_split_aces: boolean;
}
export interface Config {
  rules: Rules;
  bankroll: number;
  bet: number;
  practice: "all" | "hard" | "soft" | "pair" | "surrender" | "missed";
  feedback_mode: "immediate" | "correction" | "delayed";
}
export interface CardData {
  rank: string;
  suit: string;
  value: number;
}
export interface Snapshot {
  revision: number;
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
    outcome: string | null;
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
export interface ChartSection {
  name: string;
  rows: { label: string; actions: Action[] }[];
}
export const defaults: Config = {
  rules: {
    decks: 6,
    penetration: 0.25,
    dealer_hits_soft_17: false,
    allow_surrender: false,
    double_after_split: true,
    max_splits: 3,
    resplit_aces: true,
    one_card_on_split_aces: true,
  },
  bankroll: 1000,
  bet: 25,
  practice: "all",
  feedback_mode: "immediate",
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Trainer-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "Unexpected server response. Check that the local server is running.",
    );
  }
  if (!response.ok) {
    const message =
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((item: { msg: string }) => item.msg).join(" ")
          : "Request failed.";
    throw new ApiError(response.status, message);
  }
  return data as T;
}
