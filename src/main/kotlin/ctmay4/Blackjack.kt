package ctmay4

import ctmay4.Decision.*
import kotlin.system.measureTimeMillis

fun generateDeck(): List<Int> = (List(4) { 10 } + (2..9) + 11) * 4
fun generateDealerDeck() = (generateDeck() * 8).shuffled()

private operator fun <E> List<E>.times(num: Int) = (1..num).flatMap { this }

fun List<Int>.trueCount(): Int = -sumBy(::cardValue) * 52 / size

fun cardValue(card: Int) = when (card) {
    in 2..6 -> 1
    10, 11 -> -1
    else -> 0
}

// http://www.instructables.com/id/Card-Counting-and-Ranging-Bet-Sizes/
fun getBetSize(trueCount: Int, bankroll: Double): Double {
    val bettingUnit = bankroll / 1000
    return (bettingUnit * (trueCount - 1)).coerceIn(25.0, 1000.0)
}

const val initialMoney = 100_000.0

private fun simulate(): Double {
    val strategy = Strategy(StrategyType.STANDS_ON_SOFT_17)
    val cards = generateDealerDeck().toMutableList()
    var bankroll = initialMoney
    val shufflePoint = cards.size * 0.25 // Depends, but good estimation https://www.blackjackinfo.com/community/threads/how-often-does-the-dealer-shuffle.7459/
    while (cards.size > shufflePoint) {
        val casinoCard = cards.pop()

        fun playFrom(playerHand: Hand, bet: Double, firstTurn: Boolean): List<Pair<Double, Hand>> =
            when (strategy.decide(casinoCard, playerHand, firstTurn)) {
                STAND -> listOf(bet to playerHand)
                DOUBLE -> playFrom(playerHand + cards.pop(), bet * 2, false)
                HIT -> playFrom(playerHand + cards.pop(), bet, false)
                SPLIT -> playerHand.cards.flatMap {
                    playFrom(Hand.fromCards(listOf(it, cards.pop())), bet, false)
                }
                SURRENDER -> listOf(bet to Hand.fromCards(emptyList()))
            }

        val betsAndHands = playFrom(
            playerHand = Hand.fromCards(cards.pop(2)),
            bet = getBetSize(cards.trueCount(), bankroll),
            firstTurn = true
        )

        var casinoHand = Hand.fromCards(listOf(casinoCard, cards.pop()))
        while (casinoHand.total < 17)
            casinoHand += cards.pop()

        //println("-".repeat(30))
        for ((bet, playerHand) in betsAndHands) {
            //println("BANK: $$bankroll BET: $$bet PLAYER: $playerHand DEALER: $casinoHand")
            when {
                playerHand.cards.isEmpty() -> bankroll -= bet * 0.5  // if no cards, hand was surrendered
                playerHand.blackjack -> bankroll += bet * if (casinoHand.blackjack) 1.0 else 1.5
                playerHand.bust -> bankroll -= bet
                casinoHand.bust -> bankroll += bet
                casinoHand.total > playerHand.total -> bankroll -= bet
                casinoHand.total < playerHand.total -> bankroll += bet
                else -> bankroll -= bet
            }
        }
    }

    return bankroll - initialMoney
}

fun <T> MutableList<T>.pop(): T = removeAt(lastIndex)
fun <T> MutableList<T>.pop(num: Int): List<T> = (1..num).map { pop() }

fun main() {
    val timeElapsed = measureTimeMillis {
        (1..10000).map { simulate() }.average().let(::println)
    }
    println("Finished in ${timeElapsed}ms")
}