package adg.services;

import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.keezen.TradeRequest;
import adg.processing.MoveAvailabilityChecker;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.Trade;
import java.util.List;

/**
 * The game state as one player sees it: everything public, plus their own hand and their own
 * team's pending trade. It is what a player's live stream sends them.
 */
final class GameStatePushes {

  private GameStatePushes() {}

  static GameStatePush forPlayer(GameSession session, String playerId, boolean omitLastMove) {
    GameState gs = session.getGameState();
    GameStatePush push = new GameStatePush();
    addCoreState(push, gs, session, omitLastMove);
    addPublicCardData(push, session);
    addPrivateHandAndForfeit(push, gs, session, playerId);
    addPendingTrade(push, gs, playerId);
    return push;
  }

  private static void addCoreState(
      GameStatePush push, GameState gs, GameSession session, boolean omitLastMove) {
    push.setCurrentPlayerId(gs.getPlayerIdTurn());
    push.setPawns(gs.getPawns());
    push.setPlayers(gs.getPlayers());
    push.setWinners(gs.getWinners());
    push.setVersion(gs.getVersion());
    push.setExactMoveRequired(gs.isExactMoveRequired());
    push.setGameOver(gs.isGameOver());
    push.setLastMoveResponse(omitLastMove ? null : session.getLastMoveResponse());
  }

  private static void addPublicCardData(GameStatePush push, GameSession session) {
    push.setPlayedCards(PublicCards.playedIds(session.getCardsDeck()));
    push.setNrOfCardsPerPlayer(session.getCardsDeck().getNrOfCardsPerPlayer());
  }

  /**
   * This player's private hand and whether they may forfeit. With "must play if possible" on, the
   * player on turn can't forfeit while a legal move exists — and the moment they're first blocked
   * is recorded here (it starts the safety timeout that eventually lets them forfeit anyway).
   */
  private static void addPrivateHandAndForfeit(
      GameStatePush push, GameState gs, GameSession session, String playerId) {
    List<Card> hand = session.getCardsDeck().getCardsForPlayer(playerId);
    List<Card> safeHand = hand != null ? hand : List.of();
    push.setPlayerCards(safeHand);

    boolean canForfeit = !gs.isMustPlayIfPossible()
        || !MoveAvailabilityChecker.hasAvailableMove(gs, playerId, safeHand);
    push.setCanForfeit(canForfeit);

    // The team card trade is only offerable before you play your first card of the round.
    push.setCanRequestTrade(gs.canRequestTrade(playerId));

    if (playerId.equals(gs.getPlayerIdTurn()) && !canForfeit) {
      gs.recordMustPlayBlocked();
    }
  }

  private static void addPendingTrade(GameStatePush push, GameState gs, String playerId) {
    push.setTeamCardTrade(gs.isTeamCardTrade());

    // Only the viewer's own team's pending trade (both teammates act on it); other teams' trades
    // are invisible here, so one team asking never shows up for — or blocks — another.
    TradeRequest pending = gs.getPendingTradeFor(playerId);
    if (pending != null) {
      push.setTrade(new Trade()
          .requesterId(pending.getRequesterId())
          .teammateId(pending.getTeammateId())
          .offeredCard(pending.getOfferedCard())
          .answeredCard(pending.getAnsweredCard()));
    }
  }
}
