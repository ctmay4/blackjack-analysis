package ctmay4

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test


internal class BlackjackKtTest {

    @Test
    fun testGenerationDeck() {
        assertEquals(52, generateDeck().size)
    }

}