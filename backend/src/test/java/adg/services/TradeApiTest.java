package adg.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import adg.keezen.GameRegistry;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.TradeAction;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * Team card-trade endpoint (step 5, part 2): the delegate maps each action to the matching
 * GameState call and the personalized push carries the pending trade so both players see it.
 */
class TradeApiTest {

  private final TradeApiDelegateImpl delegate = new TradeApiDelegateImpl(new SseEmitterService());

  private static final Card OFFERED = new Card().suit(0).value(5).uuid(500);
  private static final Card KING = new Card().suit(0).value(13).uuid(513);

  /** A started 4-player team+trade game where player 0 holds OFFERED and its teammate 2 holds a King. */
  private GameSession teamTradeGame(String sessionId) {
    GameRegistry.createTestGame(sessionId);
    GameSession session = GameRegistry.getGame(sessionId);
    GameState gs = session.getGameState();
    gs.setTeamPlay(true);
    gs.setTeamCardTrade(true);
    for (int i = 0; i < 4; i++) {
      gs.addPlayer(new Player(String.valueOf(i), String.valueOf(i)));
    }
    gs.start(false); // team 0 = players 0 & 2
    session.getCardsDeck().giveCardToPlayerForTesting("0", OFFERED);
    session.getCardsDeck().giveCardToPlayerForTesting("2", KING);
    return session;
  }

  private static TradeAction action(TradeAction.ActionEnum a, String playerId, Card card) {
    return new TradeAction().action(a).playerId(playerId).card(card);
  }

  @Test
  void request_returns200_andThePushCarriesTheTrade() {
    GameSession session = teamTradeGame("trade-req");
    var response = delegate.teamTrade("trade-req", action(TradeAction.ActionEnum.REQUEST, "0", null));
    assertEquals(HttpStatus.OK, response.getStatusCode());

    var push = new SseEmitterService().buildPush(session, "2", false);
    assertNotNull(push.getTrade(), "the teammate's snapshot shows the pending trade");
    assertEquals("0", push.getTrade().getRequesterId());
    assertEquals("2", push.getTrade().getTeammateId());

    // The other team (players 1 & 3) neither sees this trade nor is blocked from opening their own.
    var otherTeamPush = new SseEmitterService().buildPush(session, "1", false);
    assertNull(otherTeamPush.getTrade(), "the other team does not see team A's trade");
    assertTrue(otherTeamPush.isCanRequestTrade(), "the other team is not blocked from trading");
    GameRegistry.removeGame("trade-req");
  }

  @Test
  void accept_swapsTheCards_andClearsTheTrade() {
    GameSession session = teamTradeGame("trade-acc");
    delegate.teamTrade("trade-acc", action(TradeAction.ActionEnum.REQUEST, "0", null));
    delegate.teamTrade("trade-acc", action(TradeAction.ActionEnum.OFFER, "0", OFFERED));
    var response = delegate.teamTrade("trade-acc", action(TradeAction.ActionEnum.ACCEPT, "2", KING));
    assertEquals(HttpStatus.OK, response.getStatusCode());
    assertTrue(session.getCardsDeck().playerHasCard("0", KING), "requester got the King");
    assertTrue(session.getCardsDeck().playerHasCard("2", OFFERED), "teammate got the offered card");
    assertNull(session.getGameState().getPendingTradeFor("0"), "trade cleared");
    GameRegistry.removeGame("trade-acc");
  }

  @Test
  void request_returns400_whenTradingIsOff() {
    GameSession session = teamTradeGame("trade-off");
    session.getGameState().setTeamCardTrade(false);
    var response = delegate.teamTrade("trade-off", action(TradeAction.ActionEnum.REQUEST, "0", OFFERED));
    assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    GameRegistry.removeGame("trade-off");
  }

  @Test
  void unknownSession_throwsNotFound() {
    // GameNotFoundException is @ResponseStatus(NOT_FOUND); Spring renders it as a 404 over HTTP.
    assertThrows(GameNotFoundException.class,
        () -> delegate.teamTrade("nope", action(TradeAction.ActionEnum.REQUEST, "0", OFFERED)));
  }
}
