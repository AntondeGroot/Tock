package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import java.util.*;
import org.junit.Assert;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CardsDeckTest {

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setup() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();
    cardsDeck.reset();
    gameState.tearDown();
  }

  @AfterEach
  void tearDown() {
    cardsDeck.reset();
    gameState.tearDown();
  }

  @Test
  void fivePlayers_ShuffleDeck_EachHas5Cards() {
    // GIVEN WHEN
    createGame_With_NPlayers(gameState, 5);

    int totalCards = 0;
    for (int i = 0; i < 5; i++) {
      totalCards += cardsDeck.getCardsForPlayer(String.valueOf(i)).size();
    }
    // THEN, all the players have 5 cards in their hand
    assertEquals(5 * 5, totalCards);
  }

  @Test
  void onePlayer_ShuffleDeck_TheyHave5Cards() {
    // GIVEN WHEN
    createGame_With_NPlayers(gameState, 1);

    // THEN
    List<Card> cards = cardsDeck.getCardsForPlayer("0");
    assertEquals(5, cards.size());

    // The unshuffled deck deals values 1,2,3,4,5 in order — a shuffle should change this
    List<Integer> cardValues = cards.stream().map(Card::getValue).toList();
    assertNotEquals(
        List.of(1, 2, 3, 4, 5),
        cardValues,
        "Cards should not be in the default unshuffled order");
  }

  @Test
  void dealCards_5_4_4_CardsPerRound() {
    // GIVEN WHEN
    createGame_With_NPlayers(gameState, 1);

    // THEN
    Assert.assertEquals(5, cardsDeck.getCardsForPlayer("0").size());
    cardsDeck.forfeitCardsForPlayer("0");
    cardsDeck.dealCards();

    Assert.assertEquals(4, cardsDeck.getCardsForPlayer("0").size());
    cardsDeck.forfeitCardsForPlayer("0");
    cardsDeck.dealCards();

    Assert.assertEquals(4, cardsDeck.getCardsForPlayer("0").size());
    cardsDeck.forfeitCardsForPlayer("0");
    cardsDeck.shuffleIfFirstRound();
    cardsDeck.dealCards();

    Assert.assertEquals(5, cardsDeck.getCardsForPlayer("0").size());
  }

  @Test
  void cardUuids_AreNotReused_AcrossReshuffles() {
    // The client identifies cards by uuid and derives its hand by subtracting the discard pile, so a
    // reused uuid would let a stale discard shadow a freshly dealt card (hiding it). Uuids must stay
    // unique for the whole session, across every reshuffle.
    createGame_With_NPlayers(gameState, 1); // deals round 0 (5 cards) from the shuffled deck

    Set<Integer> dealtBeforeReshuffle = new HashSet<>();
    // Rounds 0, 1, 2 (5 + 4 + 4) consume the whole one-player deck of 13 cards.
    for (int round = 0; round < 3; round++) {
      cardsDeck.getCardsForPlayer("0").forEach(c -> dealtBeforeReshuffle.add(c.getUuid()));
      cardsDeck.forfeitCardsForPlayer("0");
      cardsDeck.shuffleIfFirstRound(); // no-op mid-cycle; reshuffles once roundNr wraps to 0
      cardsDeck.dealCards();
    }

    // The last dealCards reshuffled and dealt a fresh deck — none of its uuids may collide.
    for (Card card : cardsDeck.getCardsForPlayer("0")) {
      assertFalse(
          dealtBeforeReshuffle.contains(card.getUuid()),
          "card uuid " + card.getUuid() + " was reused after a reshuffle");
    }
  }

  @Test
  void twoPlayersDoNotHaveTheSameCard() {
    // GIVEN WHEN
    createGame_With_NPlayers(gameState, 2);

    // WHEN
    List<Card> cards1 = cardsDeck.getCardsForPlayer("0");
    List<Card> cards2 = cardsDeck.getCardsForPlayer("1");

    // THEN
    assertTrue(doNotContainTheSameCards(cards1, cards2));
  }

  @Test
  void playerHasCard() {
    // GIVEN WHEN
    createGame_With_NPlayers(gameState, 1);

    // WHEN
    List<Card> cards = cardsDeck.getCardsForPlayer("0");

    // THEN
    assertEquals(5, cards.size());
    for (Card card : cards) {
      assertTrue(cardsDeck.playerHasCard("0", card));
    }
  }

  @Test
  void playerForfeitsCards() {
    // GIVEN
    createGame_With_NPlayers(gameState, 2);

    // WHEN
    cardsDeck.forfeitCardsForPlayer("0");

    // THEN
    HashMap<String, Integer> nrs = new HashMap<>();
    nrs.put("0", 0);
    nrs.put("1", 5);

    assertEquals(nrs, cardsDeck.getNrOfCardsPerPlayer());
    assertTrue(cardsDeck.getCardsForPlayer("0").isEmpty());
  }

  public static boolean doNotContainTheSameCards(List<Card> cards1, List<Card> cards2) {
    for (Card card : cards1) {
      if (cards2.contains(card)) {
        return false;
      }
    }
    return true;
  }

  @Test
  void getCardsForPlayer() {
    // GIVEN
    createGame_With_NPlayers(gameState, 8);

    // WHEN
    Card card = givePlayerCard(cardsDeck, 1, -4);

    // THEN
    assertTrue(cardsDeck.getCardsForPlayer("1").contains(card));
    assertTrue(cardsDeck.playerHasCard("1", card));
  }

  @Test
  void PlayedCardsDoNotResetDuringFirstRound() {
    createGame_With_NPlayers(gameState, 3);
    gameState.setPlayerIdTurn("0");
    for (int i = 0; i < 4; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "0");
      sendValidMoveRequest(gameState, cardsDeck, "1");
      sendValidMoveRequest(gameState, cardsDeck, "2");
    }
    assertEquals(3 * 4, cardsDeck.getPlayedCards().size());

    gameState.tearDown();
    cardsDeck.reset();
  }

  @Test
  void PlayedCardsDoNotResetAfterFirstRound() {
    createGame_With_NPlayers(gameState, 3);
    gameState.setPlayerIdTurn("0");
    for (int i = 0; i < 5; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "0");
      sendValidMoveRequest(gameState, cardsDeck, "1");
      sendValidMoveRequest(gameState, cardsDeck, "2");
    }
    assertEquals(3 * 5, cardsDeck.getPlayedCards().size());

    gameState.tearDown();
    cardsDeck.reset();
  }

  @Test
  void PlayedCardsDoNotResetAfterSecondRound() {
    createGame_With_NPlayers(gameState, 3);
    gameState.setPlayerIdTurn("0");
    for (int i = 0; i < 9; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "0");
      sendValidMoveRequest(gameState, cardsDeck, "1");
      sendValidMoveRequest(gameState, cardsDeck, "2");
    }
    assertEquals(3 * 5 + 3 * 4, cardsDeck.getPlayedCards().size());

    gameState.tearDown();
    cardsDeck.reset();
  }

  @Test
  void PlayedCardsResetOnTheFirstPlayAfterThirdRound() {
    createGame_With_NPlayers(gameState, 3);
    gameState.setPlayerIdTurn("0");
    for (int i = 0; i < 13; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "0");
      sendValidMoveRequest(gameState, cardsDeck, "1");
      sendValidMoveRequest(gameState, cardsDeck, "2");
    }
    // the reshuffle's push still shows the card that ended the round
    assertEquals(3 * 5 + 3 * 4 + 3 * 4, cardsDeck.getPlayedCards().size());

    sendValidMoveRequest(gameState, cardsDeck, "0");
    assertEquals(1, cardsDeck.getPlayedCards().size());

    gameState.tearDown();
    cardsDeck.reset();
  }

  @Test
  void playingClosesTheTradeWindow_andANewDealReopensIt() {
    createGame_With_NPlayers(gameState, 4);
    assertFalse(cardsDeck.hasPlayedSinceDeal("0"), "fresh deal → trade window open");

    Card first = cardsDeck.getCardsForPlayer("0").get(0);
    cardsDeck.playCard("0", first);
    assertTrue(cardsDeck.hasPlayedSinceDeal("0"), "played a card → trade window closed");

    cardsDeck.dealCards();
    assertFalse(cardsDeck.hasPlayedSinceDeal("0"), "new deal → trade window reopened");
  }
}
