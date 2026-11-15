export interface PracticeTarget {
  kind: "hard" | "soft" | "pair";
  /** Hard total, soft non-ace card, or paired card value (ace = 11). */
  player: number;
  dealer: number;
}

export function parsePracticeTarget(input: unknown): PracticeTarget {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("A chart drill requires a target.");
  const value = input as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    !["kind", "player", "dealer"].every((key) => Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => !["kind", "player", "dealer"].includes(key),
    ) ||
    !Number.isInteger(value.player) ||
    !Number.isInteger(value.dealer) ||
    Number(value.dealer) < 2 ||
    Number(value.dealer) > 11 ||
    !(
      (value.kind === "hard" &&
        Number(value.player) >= 5 &&
        Number(value.player) <= 20) ||
      (value.kind === "soft" &&
        Number(value.player) >= 2 &&
        Number(value.player) <= 9) ||
      (value.kind === "pair" &&
        Number(value.player) >= 2 &&
        Number(value.player) <= 11)
    )
  )
    throw new Error("Invalid chart drill target.");
  return {
    kind: value.kind as PracticeTarget["kind"],
    player: value.player as number,
    dealer: value.dealer as number,
  };
}

/** Use the chart's representative two-card composition, not a potentially
 * splittable pair that happens to have the same hard total. */
export function targetCards(target: PracticeTarget): [number, number] {
  if (target.kind === "soft") return [11, target.player];
  if (target.kind === "pair") return [target.player, target.player];
  return target.player < 12 ? [2, target.player - 2] : [10, target.player - 10];
}

const cardName = (value: number) => (value === 11 ? "A" : String(value));
export function targetLabel(target: PracticeTarget): string {
  const cards = targetCards(target).map(cardName).join(", ");
  return `${target.kind === "hard" ? `Hard ${target.player}` : target.kind === "soft" ? `Soft ${target.player + 11}` : "Pair"} (${cards}) vs ${cardName(target.dealer)}`;
}

export function chartTarget(
  section: string,
  row: string,
  dealer: number,
): PracticeTarget {
  return parsePracticeTarget({
    kind: section === "Hard" ? "hard" : section === "Soft" ? "soft" : "pair",
    player:
      section === "Hard"
        ? Number(row)
        : row === "A,A"
          ? 11
          : Number(row.split(",").at(-1)),
    dealer,
  });
}
