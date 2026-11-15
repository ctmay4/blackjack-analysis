import { describe, expect, it } from "vitest";
import { defaults, sessionConfig } from "./engine/session-config";
import type { Rules } from "./engine/types";
import { matchingRulePreset, rulePresets } from "./rule-presets";

describe("rule presets", () => {
  it("matches existing defaults without changing them", () => {
    expect(matchingRulePreset(defaults.rules)?.id).toBe("six-deck-s17");
    expect(new Set(rulePresets.map(({ id }) => id)).size).toBe(
      rulePresets.length,
    );
  });

  for (const preset of rulePresets) {
    it(`${preset.id} is complete, valid, immutable, and round-trips`, () => {
      expect(Object.keys(preset.rules).sort()).toEqual(
        Object.keys(defaults.rules).sort(),
      );
      const config = sessionConfig({ rules: preset.rules });
      expect(config.rules).toEqual(preset.rules);
      expect(matchingRulePreset(JSON.parse(JSON.stringify(config.rules)))).toBe(
        preset,
      );
      expect(Object.isFrozen(preset.rules)).toBe(true);
      config.rules.decks = 8;
      expect(preset.rules.decks).toBe(6);
      if (preset.rules.allow_surrender)
        expect(
          sessionConfig({ rules: preset.rules, practice: "surrender" })
            .practice,
        ).toBe("surrender");
    });
  }

  it("detects customization of every rule, not just the visible preset name", () => {
    const changes: Rules = {
      decks: 8,
      penetration: 0.5,
      dealer_hits_soft_17: true,
      allow_surrender: true,
      double_after_split: false,
      max_splits: 1,
      resplit_aces: false,
      one_card_on_split_aces: false,
    };
    for (const key of Object.keys(changes) as (keyof Rules)[]) {
      const rules = { ...defaults.rules, [key]: changes[key] };
      const match = matchingRulePreset(rules);
      // H17 and surrender intentionally match other presets; all other edits
      // must show Custom rather than retaining an inaccurate preset label.
      if (key === "dealer_hits_soft_17" || key === "allow_surrender")
        expect(match?.rules).toEqual(rules);
      else expect(match).toBeUndefined();
    }
  });
});
