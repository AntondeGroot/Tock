package adg.keezen.UnitTests;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import adg.keezen.CardsDeckInterface;
import adg.keezen.CardsDeckMock;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.Player;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Team play, step 5: the two-way King/Ace card trade. The requester offers a card and asks their
 * teammate for a King or Ace; the teammate accepts (the two cards swap) or declines. Only allowed
 * in a team game with the sub-option on, one trade at a time. (Teams are pairs: 4 players → team 0
 * = players 0 &amp; 2.)
 */
class TeamTradeTest {

  private GameState gs;
  private CardsDeckInterface deck;

  private static final Card OFFERED = new Card().suit(0).value(5).uuid(500); // a plain card A gives
  private static final Card OFFERED_2 = new Card().suit(0).value(6).uuid(506); // the other team's
  private static final Card KING = new Card().suit(0).value(13).uuid(513);
  private static final Card ACE = new Card().suit(0).value(1).uuid(501);
  private static final Card NOT_KING_OR_ACE = new Card().suit(0).value(9).uuid(509);

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession(new CardsDeckMock());
    gs = engine.getGameState();
    deck = engine.getCardsDeck();
    gs.setTeamPlay(true);
    gs.setTeamCardTrade(true);
    for (int i = 0; i < 4; i++) {
      gs.addPlayer(new Player(String.valueOf(i), String.valueOf(i)));
    }
    gs.start(false); // seat == insertion order; team 0 = players 0 & 2
  }

  /** Player 0 offers OFFERED and its teammate (player 2) holds a King. */
  private void armStandardTrade() {
    deck.giveCardToPlayerForTesting("0", OFFERED);
    deck.giveCardToPlayerForTesting("2", KING);
  }

  @Test
  void acceptedTrade_swapsTheTwoCards() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertTrue(gs.acceptTrade("2", KING));

    assertTrue(deck.playerHasCard("0", KING), "requester received the King");
    assertTrue(deck.playerHasCard("2", OFFERED), "teammate received the offered card");
    assertFalse(deck.playerHasCard("0", OFFERED));
    assertFalse(deck.playerHasCard("2", KING));
    assertNull(gs.getPendingTradeFor("0"), "trade cleared after it completes");
  }

  @Test
  void pendingTrade_clearedWhenRequesterLeaves() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    gs.processLeaveGame("0"); // requester leaves — their offered card is forfeited to the pile

    assertNull(gs.getPendingTradeFor("0"), "the trade must not survive the requester leaving");
    assertFalse(gs.acceptTrade("2", KING), "a stale trade cannot be accepted");
    // Hands stay consistent: the teammate keeps their King and gets no duplicate of the forfeited card.
    assertTrue(deck.playerHasCard("2", KING), "teammate still holds their King");
    assertFalse(deck.playerHasCard("2", OFFERED), "no duplicate of the forfeited offered card");
  }

  @Test
  void pendingTrade_clearedWhenTeammateLeaves() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    gs.processLeaveGame("2"); // the addressed teammate leaves

    assertNull(gs.getPendingTradeFor("0"), "the trade must not survive the teammate leaving");
    assertFalse(gs.acceptTrade("2", KING));
  }

  @Test
  void aceIsAlsoAcceptable() {
    deck.giveCardToPlayerForTesting("0", OFFERED);
    deck.giveCardToPlayerForTesting("2", ACE);
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertTrue(gs.acceptTrade("2", ACE));
    assertTrue(deck.playerHasCard("0", ACE));
  }

  @Test
  void request_isBlockedWhenTheSubOptionIsOff() {
    gs.setTeamCardTrade(false);
    armStandardTrade();
    assertFalse(gs.requestTrade("0"));
    assertNull(gs.getPendingTradeFor("0"));
  }

  @Test
  void offer_isBlockedWhenYouDoNotHoldTheCard() {
    // The ask itself carries no card, so it goes out; naming a card you do not hold does not.
    assertTrue(gs.requestTrade("0")); // never gave player 0 the OFFERED card
    assertFalse(gs.offerTradeCard("0", OFFERED));
    assertNull(gs.getPendingTradeFor("0").getOfferedCard());
  }

  @Test
  void onlyOneTradeAtATime() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertFalse(gs.requestTrade("0"), "a second request is refused while one is pending");
  }

  // One trade per team per round. Otherwise teammates can pass cards back and forth as often as
  // they like: A gives B a card for B's King, then B asks A for it back, and so on.
  @Test
  void afterATrade_theTeammateCannotTradeBackThisRound() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertTrue(gs.acceptTrade("2", KING));

    assertFalse(gs.canRequestTrade("2"), "the team has had its trade this round");
    assertFalse(gs.requestTrade("2"), "a trade back is refused");
  }

  // The limit is the team's, not the asker's: the player who asked cannot simply ask again.
  @Test
  void afterATrade_theRequesterCannotAskAgainThisRound() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertTrue(gs.acceptTrade("2", KING));

    assertFalse(gs.canRequestTrade("0"), "the team has had its trade this round");
    assertFalse(gs.requestTrade("0"), "a second ask is refused");
  }

  // Only a swap uses up the team's trade. An ask that is declined or withdrawn moved no cards, so
  // the team may still ask — the teammate may not have had a King yet, or the asker misclicked.
  @Test
  void anAskThatIsDeclinedOrWithdrawn_doesNotUseUpTheTeamsTrade() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.rejectTrade("2"));
    assertTrue(gs.requestTrade("0"), "asking again after a decline is allowed");
    assertTrue(gs.cancelTrade("0"));

    assertTrue(gs.canRequestTrade("2"), "the team has not traded yet this round");
    assertTrue(gs.requestTrade("2"), "the teammate may ask too");
  }

  // The limit is per round: fresh hands give the team a fresh trade. Every round is dealt through
  // the deck's dealCards, so that is where the new round starts here too.
  @Test
  void afterTheNextDeal_theTeamMayTradeAgain() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertTrue(gs.acceptTrade("2", KING));

    deck.dealCards();

    assertTrue(gs.canRequestTrade("0"), "the requester may trade again in the new round");
    assertTrue(gs.canRequestTrade("2"), "and so may the teammate");
  }

  // One team using its trade leaves every other team's trade untouched.
  @Test
  void afterATrade_anotherTeamMayStillTrade() {
    // Teams are opposite seats: team A = players 0 & 2, team B = players 1 & 3.
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertTrue(gs.acceptTrade("2", KING));

    assertTrue(gs.canRequestTrade("1"), "team B has not traded yet this round");
    assertTrue(gs.canRequestTrade("3"), "team B has not traded yet this round");
  }

  @Test
  void eachTeamTradesIndependently() {
    // Teams are opposite seats: team A = players 0 & 2, team B = players 1 & 3.
    deck.giveCardToPlayerForTesting("0", OFFERED);
    deck.giveCardToPlayerForTesting("1", OFFERED_2);

    // Team A opens a trade — team B must be neither blocked nor able to see it.
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertTrue(gs.canRequestTrade("1"), "team B is not blocked by team A's pending trade");
    assertNull(gs.getPendingTradeFor("1"), "team B does not see team A's trade");
    assertNull(gs.getPendingTradeFor("3"), "team B does not see team A's trade");

    // Team B opens its own, concurrently.
    assertTrue(gs.requestTrade("1"));
    assertTrue(gs.offerTradeCard("1", OFFERED_2));
    assertEquals("0", gs.getPendingTradeFor("2").getRequesterId()); // A's teammate sees A's trade
    assertEquals("1", gs.getPendingTradeFor("3").getRequesterId()); // B's teammate sees B's trade

    // Resolving one team's trade leaves the other untouched.
    assertTrue(gs.cancelTrade("0"));
    assertNull(gs.getPendingTradeFor("0"));
    assertEquals("1", gs.getPendingTradeFor("1").getRequesterId(), "team B's trade still stands");
  }

  @Test
  void accept_isRefusedForACardThatIsNotAKingOrAce() {
    deck.giveCardToPlayerForTesting("0", OFFERED);
    deck.giveCardToPlayerForTesting("2", NOT_KING_OR_ACE);
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertFalse(gs.acceptTrade("2", NOT_KING_OR_ACE));
    assertFalse(deck.playerHasCard("0", NOT_KING_OR_ACE), "no swap happened");
    assertTrue(gs.getPendingTradeFor("0") != null, "a refused accept leaves the trade pending");
  }

  @Test
  void accept_isRefusedFromANonTeammate() {
    armStandardTrade();
    deck.giveCardToPlayerForTesting("1", KING); // opponent also holds a King
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertFalse(gs.acceptTrade("1", KING), "an opponent can't accept a trade meant for the teammate");
  }

  @Test
  void reject_clearsTheTradeWithoutSwapping() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertTrue(gs.rejectTrade("2"));
    assertNull(gs.getPendingTradeFor("0"));
    assertTrue(deck.playerHasCard("0", OFFERED), "offered card stays with the requester");
    assertTrue(deck.playerHasCard("2", KING), "teammate keeps their King");
  }

  @Test
  void requester_canCancelTheirPendingOffer() {
    armStandardTrade();
    assertTrue(gs.requestTrade("0"));
    assertTrue(gs.offerTradeCard("0", OFFERED));
    assertTrue(gs.cancelTrade("0"));
    assertNull(gs.getPendingTradeFor("0"));
  }
}
