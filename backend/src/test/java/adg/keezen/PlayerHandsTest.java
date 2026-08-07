package adg.keezen;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.adg.openapi.model.Card;
import com.adg.openapi.model.Player;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Direct unit tests for the shared hands-and-pile store extracted from the two card decks. */
class PlayerHandsTest {

  private PlayerHands hands;

  @BeforeEach
  void setUp() {
    hands = new PlayerHands();
    hands.addPlayers(new ArrayList<>(List.of(new Player("0", "0"), new Player("1", "1"))));
  }

  private static Card card(int value) {
    return new Card().suit(0).value(value).uuid(value);
  }

  // ── holding cards ─────────────────────────────────────────────────────────
  @Test
  void giveCard_thenHasCardAndHasCardsLeft() {
    Card c = card(5);
    hands.giveCard("0", c);
    assertTrue(hands.hasCard("0", c));
    assertTrue(hands.hasCardsLeft("0"));
    assertFalse(hands.hasCardsLeft("1"), "player 1 got nothing");
  }

  @Test
  void cardsOf_isEmptyForAnUnknownPlayer() {
    assertTrue(hands.cardsOf("nope").isEmpty());
  }

  @Test
  void nrOfCardsPerPlayer_countsEachHand() {
    hands.giveCard("0", card(1));
    hands.giveCard("0", card(2));
    hands.giveCard("1", card(3));
    assertEquals(2, hands.nrOfCardsPerPlayer().get("0"));
    assertEquals(1, hands.nrOfCardsPerPlayer().get("1"));
  }

  // ── playing / discarding ──────────────────────────────────────────────────
  @Test
  void playFromHand_removesFromHandAndAddsToPile() {
    Card c = card(7);
    hands.giveCard("0", c);
    hands.playFromHand("0", c);
    assertFalse(hands.hasCard("0", c), "played card leaves the hand");
    assertTrue(hands.playedCards().contains(c), "played card is on the pile");
  }

  @Test
  void discard_addsToPileWithoutTouchingAnyHand() {
    Card c = card(7);
    hands.giveCard("0", c);
    hands.discard(c);
    assertTrue(hands.hasCard("0", c), "discard leaves the hand untouched (mock replay behaviour)");
    assertTrue(hands.playedCards().contains(c));
  }

  // ── forfeit / move / replace ──────────────────────────────────────────────
  @Test
  void forfeit_movesTheWholeHandToThePile() {
    hands.giveCard("0", card(1));
    hands.giveCard("0", card(2));
    hands.forfeit("0");
    assertFalse(hands.hasCardsLeft("0"), "hand emptied");
    assertEquals(2, hands.playedCards().size(), "both cards on the pile");
  }

  @Test
  void setHand_replacesTheHandWithoutPilingTheOldCards() {
    hands.giveCard("0", card(1));
    hands.giveCard("0", card(2));
    hands.setHand("0", List.of(card(7), card(13)));
    assertEquals(List.of(card(7), card(13)), hands.cardsOf("0"), "exactly the given cards, in order");
    assertTrue(hands.playedCards().isEmpty(), "the replaced cards are dropped, NOT put on the pile");
  }

  @Test
  void moveCard_transfersBetweenHands() {
    Card c = card(9);
    hands.giveCard("0", c);
    hands.moveCard("0", "1", c);
    assertFalse(hands.hasCard("0", c));
    assertTrue(hands.hasCard("1", c));
  }

  @Test
  void replaceFirstCard_swapsTheFirstCard() {
    hands.giveCard("0", card(1));
    hands.replaceFirstCard("0", card(8));
    assertTrue(hands.hasCard("0", card(8)));
    assertFalse(hands.hasCard("0", card(1)));
    assertEquals(1, hands.nrOfCardsPerPlayer().get("0"), "still one card");
  }

  // ── bulk clearing ─────────────────────────────────────────────────────────
  @Test
  void dropAllHands_emptiesEveryHandButKeepsThePlayers() {
    hands.giveCard("0", card(1));
    hands.giveCard("1", card(2));
    hands.dropAllHands();
    assertFalse(hands.hasCardsLeft("0"));
    assertFalse(hands.hasCardsLeft("1"));
    assertTrue(hands.cardsOf("0").isEmpty(), "player still known, just no cards");
  }

  @Test
  void reset_clearsEveryHandAndThePile() {
    hands.giveCard("0", card(1));
    hands.discard(card(2));
    hands.reset();
    assertTrue(hands.cardsOf("0").isEmpty(), "hands cleared");
    assertTrue(hands.playedCards().isEmpty(), "pile cleared");
  }

  // ── deal eligibility ──────────────────────────────────────────────────────
  @Test
  void isDealtIn_onlyForActiveUnplacedPlayers() {
    Player active = new Player("a", "a");
    active.setIsActive(true);
    active.setPlace(-1);
    assertTrue(PlayerHands.isDealtIn(active));

    Player winner = new Player("w", "w");
    winner.setIsActive(true);
    winner.setPlace(1); // medaled
    assertFalse(PlayerHands.isDealtIn(winner));

    Player inactive = new Player("i", "i");
    inactive.setIsActive(false);
    inactive.setPlace(-1);
    assertFalse(PlayerHands.isDealtIn(inactive));
  }
}
