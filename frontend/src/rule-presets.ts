import { defaults } from "./engine/session-config";
import type { Rules } from "./engine/types";

// Convenience settings, not claims about any particular casino or house edge.
// Persist the concrete rules only; old saves and backups need no schema change.
export const rulePresets = Object.freeze(
  [
    {
      id: "six-deck-s17",
      label: "6 decks · stand soft 17 · no surrender",
      hitsSoft17: false,
      surrender: false,
    },
    {
      id: "six-deck-h17",
      label: "6 decks · hit soft 17 · no surrender",
      hitsSoft17: true,
      surrender: false,
    },
    {
      id: "six-deck-s17-surrender",
      label: "6 decks · stand soft 17 · late surrender",
      hitsSoft17: false,
      surrender: true,
    },
    {
      id: "six-deck-h17-surrender",
      label: "6 decks · hit soft 17 · late surrender",
      hitsSoft17: true,
      surrender: true,
    },
  ].map(({ id, label, hitsSoft17, surrender }) =>
    Object.freeze({
      id,
      label,
      rules: Object.freeze({
        ...defaults.rules,
        dealer_hits_soft_17: hitsSoft17,
        allow_surrender: surrender,
      }),
    }),
  ),
);

/** Infer the label from every concrete rule, never from a stale saved preset ID. */
export function matchingRulePreset(rules: Readonly<Rules>) {
  return rulePresets.find((preset) =>
    (Object.keys(preset.rules) as (keyof Rules)[]).every(
      (key) => rules[key] === preset.rules[key],
    ),
  );
}
