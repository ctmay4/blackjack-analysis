import { evaluateHand, Shoe } from "./cards";
import type { RandomSource } from "./cards";
import { tableRules } from "./types";
import type {
  Action,
  CardData,
  HandResult,
  PlayerHand,
  PlayingRound,
  RoundState,
  Rules,
} from "./types";

export function playerHand(
  cards: CardData[],
  bet: number,
  splitHand = false,
): PlayerHand {
  return {
    cards,
    bet,
    splitHand,
    firstTurn: true,
    finished: false,
    surrendered: false,
    doubled: false,
  };
}
export function handValue(hand: PlayerHand) {
  return evaluateHand(hand.cards.map((card) => card.value));
}
export function isBlackjack(hand: PlayerHand): boolean {
  return !hand.splitHand && handValue(hand).blackjack;
}

/** Synchronous, UI-independent engine. Shoes are explicit; operations are atomic. */
export class BlackjackGame {
  readonly rules: Readonly<Rules>;
  shoe: Shoe;
  round: RoundState | null = null;

  constructor(rules: Partial<Rules> = {}, shoe?: Shoe, random?: RandomSource) {
    this.rules = tableRules(rules);
    this.shoe = shoe ? shoe.clone() : Shoe.shuffled(this.rules.decks, random);
  }
  private playing(): PlayingRound {
    if (!this.round || this.round.status !== "player_turn")
      throw new Error("no active round");
    return this.round;
  }
  get activeHand(): PlayerHand | null {
    return this.round?.status === "player_turn"
      ? this.round.hands[this.round.activeHandIndex]
      : null;
  }
  private restrictedSplitAce(hand: PlayerHand): boolean {
    return (
      hand.splitHand &&
      hand.cards[0].value === 11 &&
      this.rules.one_card_on_split_aces
    );
  }
  get availableActions(): Action[] {
    if (!this.round || this.round.status === "complete") return [];
    const hand = this.activeHand!;
    const actions: Action[] = this.restrictedSplitAce(hand)
      ? ["stand"]
      : ["hit", "stand"];
    if (
      !this.restrictedSplitAce(hand) &&
      hand.cards.length === 2 &&
      (!hand.splitHand || this.rules.double_after_split)
    )
      actions.push("double");
    // Disabling RE-splitting aces must not disable the original A/A split.
    if (
      handValue(hand).canSplit &&
      this.round.splitsUsed < this.rules.max_splits &&
      (hand.cards[0].value !== 11 || !hand.splitHand || this.rules.resplit_aces)
    )
      actions.push("split");
    if (
      this.rules.allow_surrender &&
      hand.firstTurn &&
      !hand.splitHand &&
      hand.cards.length === 2
    )
      actions.push("surrender");
    return actions.sort();
  }
  private transaction(operation: () => void): RoundState {
    const round = structuredClone(this.round);
    const shoe = this.shoe.clone();
    try {
      operation();
      return this.round!;
    } catch (error) {
      this.round = round;
      this.shoe = shoe;
      throw error;
    }
  }
  startRound(bet = 25): RoundState {
    if (!Number.isFinite(bet) || bet <= 0)
      throw new Error("bet must be positive and finite");
    if (this.round?.status === "player_turn")
      throw new Error("the current round is not complete");
    return this.transaction(() => {
      const up = this.shoe.draw();
      const cards = [this.shoe.draw(), this.shoe.draw()];
      const hole = this.shoe.draw();
      this.round = {
        dealerCards: [up, hole],
        hands: [playerHand(cards, bet)],
        activeHandIndex: 0,
        status: "player_turn",
        splitsUsed: 0,
        result: null,
      };
      if (
        evaluateHand([up.value, hole.value]).blackjack ||
        isBlackjack(this.round.hands[0])
      ) {
        this.round.hands[0].finished = true;
        this.finishRound();
      }
    });
  }
  apply(action: Action): RoundState {
    if (!this.availableActions.includes(action))
      throw new Error(`${action} is not available`);
    return this.transaction(() => {
      const state = this.playing();
      const hand = this.activeHand!;
      switch (action) {
        case "hit":
          hand.cards.push(this.shoe.draw());
          hand.firstTurn = false;
          if (handValue(hand).total >= 21) hand.finished = true;
          break;
        case "stand":
          hand.finished = true;
          break;
        case "double":
          hand.bet *= 2;
          hand.doubled = true;
          hand.firstTurn = false;
          hand.cards.push(this.shoe.draw());
          hand.finished = true;
          break;
        case "surrender":
          hand.surrendered = true;
          hand.finished = true;
          break;
        case "split":
          state.splitsUsed++;
          state.hands.splice(
            state.activeHandIndex,
            1,
            playerHand([hand.cards[0]], hand.bet, true),
            playerHand([hand.cards[1]], hand.bet, true),
          );
          this.prepareSplitHand();
          return;
      }
      if (hand.finished) this.advanceOrFinish();
    });
  }
  private prepareSplitHand(): void {
    const hand = this.activeHand!;
    if (hand.cards.length === 1) {
      hand.cards.push(this.shoe.draw());
      if (this.restrictedSplitAce(hand)) {
        // A new A/A pair may still be re-split under the configured limit.
        hand.finished = !this.availableActions.includes("split");
      } else if (handValue(hand).total >= 21) hand.finished = true;
    }
    if (hand.finished) this.advanceOrFinish();
  }
  private advanceOrFinish(): void {
    const state = this.playing();
    for (
      let index = state.activeHandIndex + 1;
      index < state.hands.length;
      index++
    ) {
      if (!state.hands[index].finished) {
        state.activeHandIndex = index;
        this.prepareSplitHand();
        return;
      }
    }
    this.finishRound();
  }
  private finishRound(): void {
    const state = this.playing();
    let dealer = evaluateHand(state.dealerCards.map((card) => card.value));
    const needsDealer = state.hands.some(
      (hand) =>
        !hand.surrendered && !handValue(hand).bust && !isBlackjack(hand),
    );
    if (!dealer.blackjack && needsDealer) {
      while (
        dealer.total < 17 ||
        (dealer.total === 17 && dealer.soft && this.rules.dealer_hits_soft_17)
      ) {
        state.dealerCards.push(this.shoe.draw());
        dealer = evaluateHand(state.dealerCards.map((card) => card.value));
      }
    }
    const hands: HandResult[] = state.hands.map((hand) => {
      const value = handValue(hand);
      let outcome: HandResult["outcome"], profit: number;
      if (hand.surrendered) {
        outcome = "surrender";
        profit = -hand.bet / 2;
      } else if (isBlackjack(hand)) {
        outcome = dealer.blackjack ? "push" : "win";
        profit = dealer.blackjack ? 0 : hand.bet * 1.5;
      } else if (dealer.blackjack || value.bust) {
        outcome = "loss";
        profit = -hand.bet;
      } else if (dealer.bust || value.total > dealer.total) {
        outcome = "win";
        profit = hand.bet;
      } else if (value.total < dealer.total) {
        outcome = "loss";
        profit = -hand.bet;
      } else {
        outcome = "push";
        profit = 0;
      }
      return {
        outcome,
        profit,
        bet: hand.bet,
        cards: hand.cards.map((card) => ({ ...card })),
        splitHand: hand.splitHand,
        doubled: hand.doubled,
      };
    });
    this.round = {
      ...state,
      status: "complete",
      activeHandIndex: null,
      result: {
        hands,
        dealerCards: state.dealerCards.map((card) => ({ ...card })),
        dealerBust: dealer.bust,
        dealerBlackjack: dealer.blackjack,
        profit: hands.reduce((sum, hand) => sum + hand.profit, 0),
      },
    };
  }
}
