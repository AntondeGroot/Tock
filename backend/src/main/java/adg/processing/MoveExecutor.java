package adg.processing;

import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.PLAYER_DOES_NOT_HAVE_CARD;

import adg.keezen.GameState;
import adg.util.Log;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.MoveResult;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PositionKey;
import java.util.LinkedList;
import java.util.Objects;

/**
 * Commits a validated move to the board: takes the pawn the caller has already decided on, kills
 * whatever it lands on, moves it, and plays the card.
 *
 * <p>The {@code ProcessOnX} classes decide <em>which</em> tile a pawn may reach; this decides what
 * actually happens once that tile is known. It is the last step of every move type, which is why
 * it lives beside them rather than on {@link GameState} — the state holds the board, it does not
 * work out the consequences of a move.
 */
public final class MoveExecutor {

  private MoveExecutor() {}

  public static void execute(
      GameState gs,
      Pawn pawn,
      PositionKey targetTileId,
      MoveRequest moveMessage,
      MoveResponse response) {
    execute(gs, pawn, targetTileId, moveMessage, response, true);
  }

  public static void execute(
      GameState gs,
      Pawn pawn0,
      PositionKey targetTileId,
      MoveRequest moveMessage,
      MoveResponse response,
      boolean goToNextPlayer) {

    String playerId = moveMessage.getPlayerId();
    Card card = playableCard(gs, moveMessage);
    if (card == null) {
      rejectMove(gs, response, PLAYER_DOES_NOT_HAVE_CARD);
      return;
    }
    if (gs.cannotMoveToTileBecauseSamePlayer(pawn0, targetTileId)) {
      rejectMove(gs, response, CANNOT_MAKE_MOVE);
      return;
    }

    handleKillIfPresent(gs, pawn0, targetTileId, moveMessage, response);

    response.setPawn1(pawn0);
    if (gs.isMakeMove(moveMessage)) {
      gs.movePawn(
          new Pawn(pawn0.getPlayerId(), pawn0.getPawnId(), targetTileId, pawn0.getNestTileId()));
      // goToNextPlayer is false only for the first pawn of a SPLIT move; the second call advances
      gs.finishTurn(playerId, card, goToNextPlayer);
    }

    response.setResult(CAN_MAKE_MOVE);
    Log.info("GameState: pawn moves to " + targetTileId + ", with response " + response);
  }

  /** Reject a move: wipe any partially-built move data and report why it can't be made. */
  private static void rejectMove(GameState gs, MoveResponse response, MoveResult result) {
    gs.clearResponse(response);
    response.setResult(result);
  }

  /** The card the player is trying to play, or null if none was given or they don't hold it. */
  private static Card playableCard(GameState gs, MoveRequest moveMessage) {
    Integer cardId = moveMessage.getCardId();
    if (cardId == null) {
      return null;
    }
    return gs.getCard(cardId, moveMessage.getPlayerId());
  }

  private static void handleKillIfPresent(
      GameState gs,
      Pawn pawn0,
      PositionKey targetTileId,
      MoveRequest moveMessage,
      MoveResponse response) {
    Pawn pawnOnTarget = gs.getPawn(targetTileId);
    if (pawnOnTarget == null) return;
    if (Objects.equals(pawnOnTarget.getPlayerId(), pawn0.getPlayerId())) return;

    response.setPawn1(pawn0);
    response.setPawn2(null);
    LinkedList<PositionKey> killMove = new LinkedList<>();
    killMove.add(targetTileId);
    killMove.add(pawnOnTarget.getNestTileId());
    response.setPawnKilledByPawn1(pawnOnTarget);
    response.setMovePawnKilledByPawn1(killMove);
    if (gs.isMakeMove(moveMessage)) {
      gs.movePawn(
          new Pawn(
              pawnOnTarget.getPlayerId(),
              pawnOnTarget.getPawnId(),
              pawnOnTarget.getNestTileId(),
              pawnOnTarget.getNestTileId()));
    }
  }
}
