import standTable from "./resources/stand_soft_17.txt?raw";
import hitTable from "./resources/hit_soft_17.txt?raw";
import { evaluateHand } from "./cards";
import type { Action, Recommendation } from "./types";

export type StrategyType = "stand_soft_17" | "hit_soft_17";
type Code = "H" | "S" | "P" | "DH" | "DS" | "PH" | "RH" | "RS" | "RP";
type Section = "split" | "soft" | "hard";
type Tables = Record<Section, Map<number, Code[]>>;
export interface DecisionOptions {
  firstTurn?: boolean;
  canDouble?: boolean;
  canSplit?: boolean;
}
const validCodes = new Set(["H", "S", "P", "DH", "DS", "PH", "RH", "RS", "RP"]);

/** Parse the original annotated tables, retaining their source attribution. */
export function parseStrategy(source: string): Tables {
  const tables: Tables = { split: new Map(), soft: new Map(), hard: new Map() };
  let section: Section | null = null;
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const row = raw.trim();
    if (!row || row.startsWith("#")) continue;
    if (row === "[split]" || row === "[soft]" || row === "[hard]") {
      section = row.slice(1, -1) as Section;
      continue;
    }
    const [key, ...codes] = row.split(/\s+/);
    const total = Number(key);
    if (
      !section ||
      !/^\d+$/.test(key) ||
      !Number.isInteger(total) ||
      codes.length !== 10 ||
      codes.some((code) => !validCodes.has(code))
    )
      throw new Error(`Invalid strategy row at line ${index + 1}`);
    if (tables[section].has(total))
      throw new Error(`Duplicate strategy row at line ${index + 1}`);
    tables[section].set(total, codes as Code[]);
  }
  if (Object.values(tables).some((table) => table.size === 0))
    throw new Error("Incomplete strategy table");
  return tables;
}
const tables: Record<StrategyType, Tables> = {
  stand_soft_17: parseStrategy(standTable),
  hit_soft_17: parseStrategy(hitTable),
};

export class Strategy {
  readonly type: StrategyType;
  readonly allowSurrender: boolean;
  readonly doubleAfterSplit: boolean;
  constructor(
    type: StrategyType = "stand_soft_17",
    options: { allowSurrender?: boolean; doubleAfterSplit?: boolean } = {},
  ) {
    if (!Object.hasOwn(tables, type)) throw new Error("unknown strategy type");
    this.type = type;
    this.allowSurrender = options.allowSurrender ?? false;
    this.doubleAfterSplit = options.doubleAfterSplit ?? true;
  }
  decide(
    dealer: number,
    cards: readonly number[],
    options: DecisionOptions = {},
  ): Action {
    if (!Number.isInteger(dealer) || dealer < 2 || dealer > 11)
      throw new Error("invalid dealer upcard");
    const hand = evaluateHand(cards);
    if (hand.bust) return "stand";
    const { firstTurn = true, canDouble = true, canSplit = true } = options;
    const moves = tables[this.type];
    const column = dealer - 2;
    let code =
      hand.canSplit && canSplit
        ? moves.split.get(cards[0])?.[column]
        : undefined;
    if (!code && hand.soft) code = moves.soft.get(hand.softTotal)?.[column];
    if (!code) code = moves.hard.get(hand.total)?.[column];
    const double = cards.length === 2 && canDouble;
    const surrender = this.allowSurrender && firstTurn && cards.length === 2;
    switch (code) {
      case "H":
        return "hit";
      case "S":
        return "stand";
      case "P":
        return "split";
      case "DH":
        return double ? "double" : "hit";
      case "DS":
        return double ? "double" : "stand";
      case "PH":
        return this.doubleAfterSplit ? "split" : "hit";
      case "RH":
        return surrender ? "surrender" : "hit";
      case "RS":
        return surrender ? "surrender" : "stand";
      case "RP":
        return surrender ? "surrender" : "split";
      default:
        throw new Error(
          `Unable to decide for hand ${cards.join(",")} versus ${dealer}`,
        );
    }
  }
  recommend(
    dealer: number,
    cards: readonly number[],
    options: DecisionOptions = {},
  ): Recommendation {
    const hand = evaluateHand(cards);
    const action = this.decide(dealer, cards, options);
    const handKind =
      hand.canSplit && (options.canSplit ?? true)
        ? "pair"
        : hand.soft
          ? "soft"
          : "hard";
    const description =
      handKind === "pair"
        ? `pair of ${cards[0]}s`
        : `${handKind} ${hand.total}`;
    return {
      action,
      handKind,
      playerTotal: hand.total,
      dealerCard: dealer,
      explanation: `Basic strategy recommends ${action} with ${description} against dealer ${dealer === 11 ? "A" : dealer}.`,
    };
  }
}
