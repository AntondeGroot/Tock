package adg.processing;

import static adg.processing.MoveResponses.reject;
import static adg.processing.MoveResponses.requireCardHeld;
import static adg.util.BoardLogic.isPawnOnFinish;
import static adg.util.BoardLogic.isPawnOnNest;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.INVALID_SELECTION;
import static com.adg.openapi.model.MoveType.SWITCH;

import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PositionKey;
import java.util.LinkedList;
import java.util.Objects;

public class ProcessOnSwitch {

  public static void process(GameState gs, MoveRequest moveMessage, MoveResponse moveResponse) {
    Pawn pawn1t = gs.getPawn(moveMessage.getPawn1Id());
    Pawn pawn2t = gs.getPawn(moveMessage.getPawn2Id());
    Card card = gs.getCard(moveMessage.getCardId(), moveMessage.getPlayerId());
    String playerId = moveMessage.getPlayerId();
    moveResponse.setMoveType(SWITCH);

    if (!selectionIsValid(pawn1t, pawn2t, card, moveResponse)) return;
    if (!pawnsAreDifferentPlayers(moveMessage, moveResponse)) return;
    if (!activePlayerOwnsAPawn(gs, playerId, pawn1t, pawn2t, moveResponse)) return;
    if (!requireCardHeld(gs, playerId, card, moveResponse)) return;

    Pawn pawn1 = gs.getPawn(pawn1t);
    Pawn pawn2 = gs.getPawn(pawn2t);

    if (!pawnsAreOnBoard(pawn1, pawn2, moveResponse)) return;
    if (!pawn2IsNotOnOwnStart(pawn2, moveResponse)) return;

    buildSwitchResponse(pawn1, pawn2, moveResponse);

    if (gs.isMakeMove(moveMessage)) {
      executeSwitchMove(gs, pawn1, pawn2, playerId, card);
    }
  }

  private static boolean selectionIsValid(
      Pawn pawn1, Pawn pawn2, Card card, MoveResponse response) {
    if (pawn1 == null || card == null || pawn2 == null) {
      reject(response, INVALID_SELECTION, MoveRejectionReason.INVALID_SELECTION);
      return false;
    }
    return true;
  }

  private static boolean pawnsAreDifferentPlayers(
      MoveRequest moveMessage, MoveResponse response) {
    if (Objects.equals(
        moveMessage.getPawn1Id().getPlayerId(),
        moveMessage.getPawn2Id().getPlayerId())) {
      reject(response, CANNOT_MAKE_MOVE, MoveRejectionReason.CANNOT_SWITCH_OWN_PAWNS);
      return false;
    }
    return true;
  }

  private static boolean activePlayerOwnsAPawn(
      GameState gs, String playerId, Pawn pawn1, Pawn pawn2, MoveResponse response) {
    // You must control one of the two pawns — your own, or a teammate's once your own are home.
    if (!gs.mayControlPawn(playerId, pawn1) && !gs.mayControlPawn(playerId, pawn2)) {
      reject(response, CANNOT_MAKE_MOVE, MoveRejectionReason.NOT_YOUR_PAWN);
      return false;
    }
    return true;
  }

  private static boolean pawnsAreOnBoard(Pawn pawn1, Pawn pawn2, MoveResponse response) {
    if (isPawnOnNest(pawn1) || isPawnOnNest(pawn2)
        || isPawnOnFinish(pawn1) || isPawnOnFinish(pawn2)) {
      reject(response, CANNOT_MAKE_MOVE, MoveRejectionReason.PAWN_NOT_ON_BOARD);
      return false;
    }
    return true;
  }

  private static boolean pawn2IsNotOnOwnStart(Pawn pawn2, MoveResponse response) {
    PositionKey tile2 = pawn2.getCurrentTileId();
    if (tile2.getPlayerId().equals(pawn2.getPlayerId()) && tile2.getTileNr() == 0) {
      reject(response, CANNOT_MAKE_MOVE, MoveRejectionReason.CANNOT_SWITCH_OPPONENT_ON_OWN_START);
      return false;
    }
    return true;
  }

  private static void buildSwitchResponse(Pawn pawn1, Pawn pawn2, MoveResponse response) {
    LinkedList<PositionKey> move1 = new LinkedList<>();
    LinkedList<PositionKey> move2 = new LinkedList<>();

    move1.add(pawn1.getCurrentTileId());
    move1.add(pawn2.getCurrentTileId());

    move2.add(pawn2.getCurrentTileId());
    move2.add(pawn1.getCurrentTileId());

    response.setMovePawn1(move1);
    response.setMovePawn2(move2);
    response.setPawn1(pawn1);
    response.setPawn2(pawn2);
    response.setResult(CAN_MAKE_MOVE);
  }

  private static void executeSwitchMove(
      GameState gs, Pawn pawn1, Pawn pawn2, String playerId, Card card) {
    PositionKey tileId1 = new PositionKey(
        pawn1.getCurrentTileId().getPlayerId(), pawn1.getCurrentTileId().getTileNr());
    PositionKey tileId2 = new PositionKey(
        pawn2.getCurrentTileId().getPlayerId(), pawn2.getCurrentTileId().getTileNr());

    gs.movePawn(new Pawn(pawn1.getPlayerId(), pawn1.getPawnId(), tileId2, pawn1.getNestTileId()));
    gs.movePawn(new Pawn(pawn2.getPlayerId(), pawn2.getPawnId(), tileId1, pawn2.getNestTileId()));
    gs.finishTurn(playerId, card, true);
  }
}