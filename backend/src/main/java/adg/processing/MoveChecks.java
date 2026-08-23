package adg.processing;

import static com.adg.openapi.model.MoveType.MOVE;
import static com.adg.openapi.model.TempMessageType.CHECK_MOVE;

import adg.keezen.GameState;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.PawnId;

/** Shared non-mutating move look-aheads used by the move recommenders / availability checks. */
final class MoveChecks {

  private MoveChecks() {}

  /**
   * Run a single pawn's MOVE through a CHECK_MOVE — no temp mutations on the shared game state — and
   * return the resulting response, whose result tells whether the move is legal.
   */
  static MoveResponse checkMove(
      GameState gs, String playerId, int cardId, PawnId pawnId, int steps) {
    MoveRequest req = new MoveRequest();
    req.setPlayerId(playerId);
    req.setCardId(cardId);
    req.setPawn1Id(pawnId);
    req.setStepsPawn1(steps);
    req.setMoveType(MOVE);
    req.setTempMessageType(CHECK_MOVE);
    MoveResponse resp = new MoveResponse();
    ProcessOnMove.process(gs, req, resp);
    return resp;
  }
}
