package ctmay4

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import ctmay4.Decision.*
import org.junit.Test

internal class StrategyTest {

    private fun testAllCombinations(strategy: Strategy) {
        for (card1 in 2..11)
            for (card2 in 2..11)
                for (dealer in 2..11) {
                    strategy.decide(dealer, Hand.fromCards(listOf(card1, card2)), true)
                    strategy.decide(dealer, Hand.fromCards(listOf(card1, card2)), false)
                }
    }

    @Test
    fun testLoad() {
        val stand = Strategy(StrategyType.STANDS_ON_SOFT_17)
        val hit = Strategy(StrategyType.HITS_ON_SOFT_17)

        // test all combinations
        testAllCombinations(stand)
        testAllCombinations(hit)

        assertThat(stand.decide(10, Hand.fromCards(listOf(10, 6)))).isEqualTo(hit.decide(10, Hand.fromCards(listOf(10, 6))))

        // verify a differences
        val hand = Hand.fromCards(listOf(11, 8))
        assertThat(stand.decide(6, hand)).isEqualTo(STAND)
        assertThat(hit.decide(6, hand)).isEqualTo(DOUBLE)
    }

    @Test
    fun testIsSoft() {
        assertThat(Hand.fromCards(listOf(2, 2)).soft).isFalse()
        assertThat(Hand.fromCards(listOf(10, 4, 11)).soft).isFalse()

        assertThat(Hand.fromCards(listOf(11, 8)).soft).isTrue()
        assertThat(Hand.fromCards(listOf(8, 11)).soft).isTrue()
        assertThat(Hand.fromCards(listOf(9, 11)).soft).isTrue()
        assertThat(Hand.fromCards(listOf(11, 2)).soft).isTrue()
        assertThat(Hand.fromCards(listOf(2, 11)).soft).isTrue()
        assertThat(Hand.fromCards(listOf(11, 11, 11)).soft).isTrue()
    }

    @Test
    fun testHand() {
        var hand = Hand.fromCards(listOf(11, 8))
        assertThat(hand.numAces).isEqualTo(1)
        assertThat(hand.softTotal).isEqualTo(9)
        assertThat(hand.total).isEqualTo(19)
        assertThat(hand.soft).isTrue()

        hand = Hand.fromCards(listOf(11, 2, 11))
        assertThat(hand.numAces).isEqualTo(2)
        assertThat(hand.softTotal).isEqualTo(4)
        assertThat(hand.total).isEqualTo(14)
        assertThat(hand.soft).isTrue()

        hand = Hand.fromCards(listOf(10, 6))
        assertThat(hand.total).isEqualTo(16)
        assertThat(hand.bust).isFalse()
        hand += 10
        assertThat(hand.total).isEqualTo(26)
        assertThat(hand.bust).isTrue()

        hand = Hand.fromCards(listOf(10, 6, 11, 11))
        assertThat(hand.total).isEqualTo(18)
        assertThat(hand.bust).isFalse()

        hand = Hand.fromCards(listOf(10, 6, 4, 11, 11))
        assertThat(hand.total).isEqualTo(22)
        assertThat(hand.bust).isTrue()
    }

    @Test
    fun testDecide() {
        val moves = Strategy(StrategyType.STANDS_ON_SOFT_17)

        // test card pair
        assertThat(moves.decide(7, Hand.fromCards(listOf(7, 7)))).isEqualTo(SPLIT)
        assertThat(moves.decide(5, Hand.fromCards(listOf(4, 4)))).isEqualTo(DOUBLE)
        assertThat(moves.decide(5, Hand.fromCards(listOf(11, 7)))).isEqualTo(DOUBLE)
        assertThat(moves.decide(5, Hand.fromCards(listOf(7, 11)))).isEqualTo(DOUBLE)

        // test totals
        assertThat(moves.decide(6, Hand.fromCards(listOf(5, 10)))).isEqualTo(STAND)
        assertThat(moves.decide(10, Hand.fromCards(listOf(5, 6)))).isEqualTo(DOUBLE)
        assertThat(moves.decide(10, Hand.fromCards(listOf(10, 6)))).isEqualTo(HIT)

        // test first move
        assertThat(moves.decide(10, Hand.fromCards(listOf(11, 11)))).isEqualTo(SPLIT)
        assertThat(moves.decide(10, Hand.fromCards(listOf(11, 11)), false)).isEqualTo(SPLIT)

        // test high totals
        assertThat(moves.decide(10, Hand.fromCards(listOf(10, 6, 10)))).isEqualTo(STAND)
        assertThat(moves.decide(10, Hand.fromCards(listOf(8, 11)))).isEqualTo(STAND)
        assertThat(moves.decide(10, Hand.fromCards(listOf(11, 9)))).isEqualTo(STAND)
        assertThat(moves.decide(10, Hand.fromCards(listOf(10, 11)))).isEqualTo(STAND)
    }

}
