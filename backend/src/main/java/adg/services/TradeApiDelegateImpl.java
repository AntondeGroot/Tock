package adg.services;

import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.api.TradeApiDelegate;
import com.adg.openapi.model.TradeAction;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

/**
 * The team card-trade endpoint (step 5). A single action maps to the matching {@link GameState}
 * lifecycle call; on success the new state (swapped hands and/or cleared trade) is pushed over
 * SSE so both the requester and their teammate update live. The trade is free — it never touches
 * the turn.
 */
@Service
public class TradeApiDelegateImpl implements TradeApiDelegate {

  private final SseEmitterService sseEmitterService;

  public TradeApiDelegateImpl(SseEmitterService sseEmitterService) {
    this.sseEmitterService = sseEmitterService;
  }

  @Override
  public ResponseEntity<Void> teamTrade(String sessionId, TradeAction action) {
    GameSession session = Games.require(sessionId);
    if (action == null || action.getAction() == null || action.getPlayerId() == null) {
      return ResponseEntity.badRequest().build();
    }

    GameState gs = session.getGameState();
    String playerId = action.getPlayerId();
    boolean ok = switch (action.getAction()) {
      case REQUEST -> gs.requestTrade(playerId);
      case OFFER -> gs.offerTradeCard(playerId, action.getCard());
      case ACCEPT -> gs.acceptTrade(playerId, action.getCard());
      case REJECT -> gs.rejectTrade(playerId);
      case CANCEL -> gs.cancelTrade(playerId);
    };

    if (!ok) {
      return ResponseEntity.badRequest().build();
    }
    sseEmitterService.push(sessionId, session);
    return ResponseEntity.ok().build();
  }
}
