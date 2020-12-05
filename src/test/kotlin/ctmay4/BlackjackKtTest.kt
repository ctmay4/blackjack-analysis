package ctmay4

import assertk.assertThat
import assertk.assertions.hasSize
import org.junit.Test

internal class BlackjackKtTest {

    @Test
    fun testGenerationDeck() {
        assertThat(generateDeck()).hasSize(52)
    }

}