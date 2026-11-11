import { describe, expect, it } from "vitest";
import reference from "./fixtures/python-reference.json";
import standTable from "./resources/stand_soft_17.txt?raw";
import hitTable from "./resources/hit_soft_17.txt?raw";
import { Shoe } from "./cards";
import { BlackjackGame, handValue } from "./game";
import { Strategy } from "./strategy";
import type { StrategyType } from "./strategy";
import type { Action, CardData } from "./types";

function snapshot(game: BlackjackGame) {
  const state = game.round!;
  return {
    status: state.status,
    dealerCards: state.dealerCards,
    activeHandIndex: state.activeHandIndex,
    splitsUsed: state.splitsUsed,
    availableActions: game.availableActions,
    remainingCards: game.shoe.length,
    hands: state.hands.map((hand) => ({
      ...hand,
      total: handValue(hand).total,
      soft: handValue(hand).soft,
    })),
    result: state.result
      ? {
          profit: state.result.profit,
          dealerBust: state.result.dealerBust,
          dealerBlackjack: state.result.dealerBlackjack,
          hands: state.result.hands,
        }
      : null,
  };
}

it("uses the exact original strategy tables, including source attribution", () => {
  expect(reference.format).toBe(1);
  expect(standTable).toBe(reference.tables.stand_soft_17);
  expect(hitTable).toBe(reference.tables.hit_soft_17);
});

describe("Python strategy reference: 68,480 decisions", () => {
  for (const [index, fixture] of reference.strategies.entries()) {
    it(`matches strategy configuration ${index}: ${JSON.stringify({ ...fixture, decisions: undefined })}`, () => {
      const strategy = new Strategy(fixture.type as StrategyType, fixture);
      let offset = 0;
      const symbol: Record<Action, string> = {
        hit: "H",
        stand: "S",
        double: "D",
        split: "P",
        surrender: "R",
      };
      for (const cards of reference.strategyHands)
        for (let dealer = 2; dealer <= 11; dealer++) {
          const actual = symbol[strategy.decide(dealer, cards, fixture)];
          if (actual !== fixture.decisions[offset])
            throw new Error(
              `Parity mismatch: cards ${cards}, dealer ${dealer}: expected ${fixture.decisions[offset]}, got ${actual}`,
            );
          offset++;
        }
      expect(offset).toBe(fixture.decisions.length);
    });
  }
});

describe("Python game reference: explicit shoes, not cross-language random seeds", () => {
  for (const fixture of reference.games) {
    it(fixture.name, () => {
      const game = new BlackjackGame(
        fixture.rules,
        new Shoe(fixture.shoe as CardData[]),
      );
      game.startRound(fixture.bet);
      expect(snapshot(game)).toEqual(fixture.states[0]);
      for (const [index, action] of fixture.actions.entries()) {
        game.apply(action as Action);
        expect(snapshot(game), `after action ${index}: ${action}`).toEqual(
          fixture.states[index + 1],
        );
      }
      expect(game.round?.status).toBe("complete");
    });
  }
});
