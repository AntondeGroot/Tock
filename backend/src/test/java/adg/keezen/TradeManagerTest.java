package adg.keezen;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.adg.openapi.model.Card;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Direct unit tests for the extracted team-trade rules. Collaborators are injected, so every branch
 * is reachable without building a full GameState.
 */
class TradeManagerTest {

  private static final Card OFFERED = new Card().suit(0).value(5).uuid(500);
  private static final Card KING = new Card().suit(0).value(13).uuid(513);
  private static final Card ACE = new Card().suit(0).value(1).uuid(501);
  private static final Card NINE = new Card().suit(0).value(9).uuid(509);

  private CardsDeckInterface deck;
  private AtomicLong version;
  private TradeManager trade;

  private TradeManager build(boolean teamGameStarted) {
    BooleanSupplier started = () -> teamGameStarted;
    // "R" (requester) and "T" (teammate) are partners (symmetric, like the real roster); anyone
    // else has no teammate.
    return new TradeManager(
        deck,
        version,
        started,
        id -> "R".equals(id) ? "T" : "T".equals(id) ? "R" : null,
        card -> card.getValue() == 13 || card.getValue() == 1);
  }

  @BeforeEach
  void setUp() {
    deck = mock(CardsDeckInterface.class);
    version = new AtomicLong(0);
    trade = build(true);
    trade.setEnabled(true);
    // Default: the requester still has a full hand and hasn't played this round (mock defaults to
    // false for both, so only the positive one needs stubbing) — i.e. the trade window is open.
    when(deck.playerHasCardsLeft("R")).thenReturn(true);
  }

  /** A pending R→T ask with OFFERED already on the table — the ask, then the card. */
  private void givenPendingOffer() {
    givenPendingAsk();
    when(deck.playerHasCard("R", OFFERED)).thenReturn(true);
    assertTrue(trade.offer("R", OFFERED));
    assertEquals(2, version.get());
  }

  /** A pending R→T ask with nothing offered yet — the state between clicking and picking. */
  private void givenPendingAsk() {
    assertTrue(trade.request("R"));
    assertEquals(1, version.get());
  }

  // ── enabled flag ──────────────────────────────────────────────────────────
  @Test
  void enabledFlagRoundTrips() {
    trade.setEnabled(false);
    assertFalse(trade.isEnabled());
    trade.setEnabled(true);
    assertTrue(trade.isEnabled());
  }

  // ── request ───────────────────────────────────────────────────────────────
  @Test
  void requestRejectedWhenGameNotStarted() {
    trade = build(false);
    trade.setEnabled(true);
    when(deck.playerHasCard("R", OFFERED)).thenReturn(true);
    assertFalse(trade.request("R"));
    assertNull(trade.getPendingFor("R"));
    assertEquals(0, version.get());
  }

  @Test
  void requestRejectedWhenTradingDisabled() {
    trade.setEnabled(false);
    assertFalse(trade.request("R"));
    assertNull(trade.getPendingFor("R"));
  }

  @Test
  void requestRejectedWhenTradeAlreadyPending() {
    givenPendingOffer();
    assertFalse(trade.request("R"));
    assertEquals(2, version.get()); // unchanged by the second request
  }

  @Test
  void requestRejectedWhenPlayerHasNoTeammate() {
    when(deck.playerHasCard("X", OFFERED)).thenReturn(true);
    assertFalse(trade.request("X")); // "X" resolves to no teammate
    assertNull(trade.getPendingFor("R"));
  }

  @Test
  void requestRecordsTheAskWithNothingOfferedYet() {
    givenPendingAsk();
    TradeRequest pending = trade.getPendingFor("R");
    assertEquals("R", pending.getRequesterId());
    assertEquals("T", pending.getTeammateId());
    assertNull(pending.getOfferedCard(), "the ask goes out before a card is picked");
  }

  // ── offer (the requester names, or renames, what they give) ────────────────
  @Test
  void offerRejectedWhenCardIsNull() {
    givenPendingAsk();
    assertFalse(trade.offer("R", null));
    assertNull(trade.getPendingFor("R").getOfferedCard());
  }

  @Test
  void offerRejectedWhenRequesterDoesNotHoldTheCard() {
    givenPendingAsk();
    when(deck.playerHasCard("R", OFFERED)).thenReturn(false);
    assertFalse(trade.offer("R", OFFERED));
    assertNull(trade.getPendingFor("R").getOfferedCard());
  }

  @Test
  void offerPutsTheCardOnTheTable() {
    givenPendingOffer();
    assertSame(OFFERED, trade.getPendingFor("R").getOfferedCard());
  }

  @Test
  void requestRejectedAfterRequesterHasPlayedThisRound() {
    // The trade window closes on your first play of the round.
    when(deck.hasPlayedSinceDeal("R")).thenReturn(true);
    when(deck.playerHasCard("R", OFFERED)).thenReturn(true);
    assertFalse(trade.request("R"));
    assertNull(trade.getPendingFor("R"));
    assertEquals(0, version.get());
  }

  @Test
  void requestRejectedWhenRequesterHasNoCardsLeft() {
    when(deck.playerHasCardsLeft("R")).thenReturn(false);
    when(deck.playerHasCard("R", OFFERED)).thenReturn(true);
    assertFalse(trade.request("R"));
    assertNull(trade.getPendingFor("R"));
  }

  // ── canRequest (drives the "ask" button; independent of the offered card) ───
  @Test
  void canRequestTrueWhenWindowOpen() {
    assertTrue(trade.canRequest("R"));
  }

  @Test
  void canRequestFalseAfterPlayingThisRound() {
    when(deck.hasPlayedSinceDeal("R")).thenReturn(true);
    assertFalse(trade.canRequest("R"));
  }

  @Test
  void canRequestFalseWhenDisabledPendingNoTeammateOrNoCards() {
    trade.setEnabled(false);
    assertFalse(trade.canRequest("R"));
    trade.setEnabled(true);

    assertFalse(trade.canRequest("X")); // no teammate

    when(deck.playerHasCardsLeft("R")).thenReturn(false);
    assertFalse(trade.canRequest("R")); // no cards
    when(deck.playerHasCardsLeft("R")).thenReturn(true);

    givenPendingOffer();
    assertFalse(trade.canRequest("R")); // a trade is already pending
  }

  // ── accept ────────────────────────────────────────────────────────────────
  @Test
  void acceptRejectedWhenNoPendingTrade() {
    assertFalse(trade.accept("T", KING));
  }

  @Test
  void acceptBeforeAnOfferHoldsTheKingUntilTheRequesterPicks() {
    // The ask reaches the teammate first, so they can commit a King with nothing yet to swap it
    // for. Their half is held rather than refused — neither player waits on the other.
    givenPendingAsk();
    when(deck.playerHasCard("T", KING)).thenReturn(true);
    assertTrue(trade.accept("T", KING), "they may give straight away");
    assertSame(KING, trade.getPendingFor("R").getAnsweredCard());
    verify(deck, never()).moveCardBetweenHands(org.mockito.ArgumentMatchers.anyString(),
        org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any());

    // …and the swap goes through the moment the requester names their side.
    when(deck.playerHasCard("R", OFFERED)).thenReturn(true);
    assertTrue(trade.offer("R", OFFERED));
    verify(deck).moveCardBetweenHands("R", "T", OFFERED);
    verify(deck).moveCardBetweenHands("T", "R", KING);
    assertNull(trade.getPendingFor("R"), "both halves in — the trade is done");
  }

  @Test
  void offeringAgainReplacesTheStandingOffer() {
    givenPendingOffer();
    when(deck.playerHasCard("R", NINE)).thenReturn(true);
    assertTrue(trade.offer("R", NINE), "you may change your mind until they hand a card over");
    assertSame(NINE, trade.getPendingFor("R").getOfferedCard());
  }

  @Test
  void acceptRejectedWhenNotTheAddressedTeammate() {
    givenPendingOffer();
    assertFalse(trade.accept("someone-else", KING));
    assertEquals("T", trade.getPendingFor("R").getTeammateId()); // still pending
  }

  @Test
  void acceptRejectedWhenCardIsNull() {
    givenPendingOffer();
    assertFalse(trade.accept("T", null));
  }

  @Test
  void acceptRejectedWhenCardIsNotKingOrAce() {
    givenPendingOffer();
    when(deck.playerHasCard("T", NINE)).thenReturn(true);
    assertFalse(trade.accept("T", NINE));
  }

  @Test
  void acceptRejectedWhenTeammateDoesNotHoldKingOrAce() {
    givenPendingOffer();
    when(deck.playerHasCard("T", KING)).thenReturn(false);
    assertFalse(trade.accept("T", KING));
  }

  @Test
  void acceptDropsStaleTradeWhenRequesterNoLongerHoldsOfferedCard() {
    givenPendingOffer();
    when(deck.playerHasCard("T", KING)).thenReturn(true);
    when(deck.playerHasCard("R", OFFERED)).thenReturn(false); // requester left/forfeited
    assertFalse(trade.accept("T", KING));
    assertNull(trade.getPendingFor("R")); // stale trade dropped
    assertEquals(3, version.get()); // dropped bumps version
    verify(deck, never()).moveCardBetweenHands(org.mockito.ArgumentMatchers.anyString(),
        org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void acceptWithAceSwapsBothCardsClearsTradeAndBumpsVersion() {
    givenPendingOffer();
    when(deck.playerHasCard("T", ACE)).thenReturn(true);
    when(deck.playerHasCard("R", OFFERED)).thenReturn(true);
    assertTrue(trade.accept("T", ACE));
    verify(deck).moveCardBetweenHands("R", "T", OFFERED);
    verify(deck).moveCardBetweenHands("T", "R", ACE);
    assertNull(trade.getPendingFor("R"));
    assertEquals(3, version.get());
  }

  // ── reject ────────────────────────────────────────────────────────────────
  @Test
  void rejectRejectedWhenNoPendingTrade() {
    assertFalse(trade.reject("T"));
  }

  @Test
  void rejectRejectedWhenNotTheAddressedTeammate() {
    givenPendingOffer();
    assertFalse(trade.reject("someone-else"));
    assertEquals("T", trade.getPendingFor("R").getTeammateId());
  }

  @Test
  void rejectClearsPendingTrade() {
    givenPendingOffer();
    assertTrue(trade.reject("T"));
    assertNull(trade.getPendingFor("R"));
    assertEquals(3, version.get());
  }

  // ── cancel ────────────────────────────────────────────────────────────────
  @Test
  void cancelRejectedWhenNoPendingTrade() {
    assertFalse(trade.cancel("R"));
  }

  @Test
  void cancelRejectedWhenNotTheRequester() {
    givenPendingOffer();
    assertFalse(trade.cancel("T")); // the teammate can't cancel
    assertEquals("R", trade.getPendingFor("R").getRequesterId());
  }

  @Test
  void cancelClearsPendingTrade() {
    givenPendingOffer();
    assertTrue(trade.cancel("R"));
    assertNull(trade.getPendingFor("R"));
    assertEquals(3, version.get());
  }

  // ── cancelForDeparture ──────────────────────────────────────────────────────
  @Test
  void departureIsNoOpWhenNoPendingTrade() {
    trade.cancelForDeparture("R"); // must not throw
    assertNull(trade.getPendingFor("R"));
  }

  @Test
  void departureOfRequesterDropsTrade() {
    givenPendingOffer();
    trade.cancelForDeparture("R");
    assertNull(trade.getPendingFor("R"));
  }

  @Test
  void departureOfTeammateDropsTrade() {
    givenPendingOffer();
    trade.cancelForDeparture("T");
    assertNull(trade.getPendingFor("R"));
  }

  @Test
  void departureOfUninvolvedPlayerKeepsTrade() {
    givenPendingOffer();
    trade.cancelForDeparture("someone-else");
    assertEquals("R", trade.getPendingFor("R").getRequesterId());
  }

  // ── clearPending ────────────────────────────────────────────────────────────
  @Test
  void clearPendingRemovesPendingTrade() {
    givenPendingOffer();
    trade.clearPending();
    assertNull(trade.getPendingFor("R"));
  }
}
