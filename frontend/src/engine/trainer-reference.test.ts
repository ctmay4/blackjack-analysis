import { describe, expect, it } from "vitest";
import reference from "./fixtures/python-trainer-reference.json";
import { Shoe } from "./cards";
import { TrainerSession } from "./trainer";
import type { Action, CardData } from "./types";

function frame(session: TrainerSession) {
  return {
    snapshot: session.snapshot(),
    feedback: session.feedback,
    extraStats: {
      mistakesByChoice: [...session.stats.mistakesByChoice],
      mistakesByRecommendation: [...session.stats.mistakesByRecommendation],
      openingMisses: [...session.stats.openingMisses],
      playerBlackjacks: session.stats.playerBlackjacks,
      dealerBlackjacks: session.stats.dealerBlackjacks,
      playerBusts: session.stats.playerBusts,
    },
    remainingCards: session.game.shoe.length,
  };
}

describe("Python trainer reference: 93 traces, 618 presentation/teaching frames", () => {
  for (const fixture of reference.cases) {
    it(fixture.name, () => {
      let session = new TrainerSession(fixture.config, {
        shoe: new Shoe(fixture.shoe as CardData[]),
      });
      expect(frame(session)).toEqual(fixture.frames[0]);
      session = TrainerSession.restore(
        JSON.parse(JSON.stringify(session.checkpoint())),
      );
      expect(frame(session)).toEqual(fixture.frames[0]);
      for (const [index, action] of fixture.actions.entries()) {
        if (action === "next") session.nextRound();
        else session.choose(action as Action);
        expect(frame(session), `after action ${index}: ${action}`).toEqual(
          fixture.frames[index + 1],
        );
        session = TrainerSession.restore(
          JSON.parse(JSON.stringify(session.checkpoint())),
        );
        expect(
          frame(session),
          `restored after action ${index}: ${action}`,
        ).toEqual(fixture.frames[index + 1]);
      }
      expect(session.strategyChart()).toEqual(fixture.chart);
    });
  }
});
