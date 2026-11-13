import { expect, it } from "vitest";
import { seededRandom } from "./cards";
import { TrainerSession } from "./trainer";

it("restores long-running varied rules and delayed feedback without RNG or score drift", () => {
  for (let seed = 1; seed <= 16; seed++) {
    const random = seededRandom(seed + 100);
    const trainer = new TrainerSession(
      {
        feedback_mode: seed % 2 ? "immediate" : "delayed",
        rules: {
          decks: (seed % 8) + 1,
          dealer_hits_soft_17: !!(seed & 1),
          allow_surrender: !!(seed & 2),
          double_after_split: !!(seed & 4),
          max_splits: seed % 4,
          resplit_aces: !!(seed & 8),
          one_card_on_split_aces: !!(seed & 2),
        },
      },
      { random: seededRandom(seed) },
    );
    for (let round = 0; round < 50; round++) {
      let decisions = 0;
      while (trainer.round.status !== "complete") {
        expect(++decisions).toBeLessThan(100);
        const restored = TrainerSession.restore(trainer.checkpoint());
        const actions = trainer.snapshot().available_actions;
        const action = actions[Math.floor(random() * actions.length)];
        trainer.choose(action);
        restored.choose(action);
        expect(restored.checkpoint()).toEqual(trainer.checkpoint());
      }
      const stats = trainer.snapshot().stats;
      expect(stats.rounds).toBe(round + 1);
      expect(stats.wins + stats.losses + stats.pushes + stats.surrenders).toBe(
        stats.hands,
      );
      expect(Number.isFinite(trainer.bankroll)).toBe(true);
      const restored = TrainerSession.restore(trainer.checkpoint());
      expect(restored.nextRound()).toEqual(trainer.nextRound());
    }
  }
});
