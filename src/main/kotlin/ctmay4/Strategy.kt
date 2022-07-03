package ctmay4

import ctmay4.Decision.*
import ctmay4.Strategy.Action.*
import java.io.File
import java.nio.charset.StandardCharsets

enum class StrategyType(val file: String) {
    STANDS_ON_SOFT_17("stand_soft_17"),
    HITS_ON_SOFT_17("hit_soft_17")
}

enum class Decision { STAND, DOUBLE, HIT, SPLIT, SURRENDER }

class Hand private constructor(val cards: List<Int>) {

    operator fun plus(card: Int) = fromCards(cards + card)

    companion object {
        fun fromCards(cards: List<Int>): Hand = Hand(cards)
    }

    val numAces: Int = cards.count { it == 11 }
    val total: Int = let {
        var total = cards.sum()
        var aces = numAces
        while (total > 21 && aces-- > 0)
            total -= 10
        total
    }
    val soft: Boolean = let {
        when {
            numAces < 1 -> false // No aces mean hand cannot be soft
            else -> 21 - (cards.filter { x -> x != 11 }.sum() + (numAces - 1)) >= 11  // if any number of aces can be added in at their primary value then the hand is soft
        }
    }
    val softTotal: Int = cards.sumOf { x -> if (x == 11) 1 else x }
    val canSplit: Boolean = cards.size == 2 && cards[0] == cards[1]
    val blackjack: Boolean = cards.size == 2 && total == 21
    val bust: Boolean = total > 21

    override fun toString(): String {
        return "$cards"
    }

}

/**
 * Logic from https://www.oddsbusters.com/us/getting-started/strategies/blackjack/blackjack-cheat-sheet/
 *
 * - first column depends on section:
 *    - for "split" it represents the card which there are two of
 *    - for "soft" it represents the non-Ace card
 *    - for "hard it represents the total value of the hand
 * - columns 2-11 represent what to do based on the dealers up card (2,3,4,5,6,7,8,9,10,A)
 */
data class Strategy(val type: StrategyType, val allowSurrender: Boolean = false, val doubleAfterSplit: Boolean = true) {
    private val splitMoves = mutableMapOf<Int, Map<Int, Action>>()
    private val softMoves = mutableMapOf<Int, Map<Int, Action>>()
    private val hardMoves = mutableMapOf<Int, Map<Int, Action>>()

    // actions defined in strategy file
    private enum class Action {
        H,   // hit
        S,   // stand
        P,   // split
        DH,  // double down if possible, otherwise hit
        DS,  // double down if possible, otherwise stand
        PH,  // split if double down after split is possible, otherwise hit
        RH,  // surrender if possible, otherwise hit
        RS,  // surrender if possible, otherwise stand
        RP   // surrender if possible, otherwise split
    }

    init {
        var current = mutableMapOf<Int, Map<Int, Action>>()
        File(ClassLoader.getSystemResource(type.file).file)
            .readLines(StandardCharsets.US_ASCII)
            .filter { row -> !row.startsWith("#") && row.trim().isNotEmpty() }
            .map { row ->
                when {
                    row.trim() == "[split]" -> current = splitMoves
                    row.trim() == "[soft]" -> current = softMoves
                    row.trim() == "[hard]" -> current = hardMoves
                    else -> row.split("\\s+".toRegex()).let { array ->
                        // build map of dealer cards
                        val dealerCards = mutableMapOf<Int, Action>()
                        listOf(2, 3, 4, 5, 6, 7, 8, 9, 10, 11).forEachIndexed { index, element ->
                            dealerCards[element] = Action.valueOf(array[index + 1].trim())
                        }

                        current[array[0].trim().toInt()] = dealerCards
                    }
                }
            }
    }

    fun decide(dealer: Int, player: Hand, firstTurn: Boolean = true): Decision {
        if (player.total > 21)
            return STAND

        val action = when {
            player.canSplit -> splitMoves[player.cards[0]]?.get(dealer)   // player has two cards that are the same, use split rules
            player.soft -> softMoves[player.softTotal]?.get(dealer)       // player hand is "soft", use soft rules
            else -> hardMoves[player.total]?.get(dealer)                  // otherwise use "hard" rules
        }
            ?: throw IllegalArgumentException("Unable to find decide for hand ${player.cards} with dealer showing [$dealer]")

        return when (action) {
            H -> HIT
            S -> STAND
            P -> SPLIT
            DH -> if (player.cards.size == 2) DOUBLE else HIT
            DS -> if (player.cards.size == 2) DOUBLE else STAND
            PH -> if (doubleAfterSplit) DOUBLE else HIT
            RH -> if (firstTurn && player.cards.size == 2) SURRENDER else HIT
            RS -> if (firstTurn && player.cards.size == 2) SURRENDER else STAND
            RP -> if (firstTurn && player.cards.size == 2) SURRENDER else SPLIT
        }
    }

}
