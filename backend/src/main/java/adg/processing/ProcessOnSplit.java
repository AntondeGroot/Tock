package adg.processing;

import static adg.processing.MoveResponses.reject;
import static adg.processing.MoveResponses.requireCardHeld;
import static adg.util.CardValueCheck.isSeven;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.INVALID_SELECTION;
import static com.adg.openapi.model.MoveResult.PLAYER_DOES_NOT_HAVE_CARD;
import static com.adg.openapi.model.MoveType.SPLIT;
import static com.adg.openapi.model.TempMessageType.CHECK_MOVE;
import static com.adg.openapi.model.TempMessageType.MAKE_MOVE;

import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;

public class ProcessOnSplit {

  public static void process(GameState gs, MoveRequest moveMessage, MoveResponse response) {
    new ProcessOnSplit(gs, moveMessage, response).execute();
  }

  // ── Instance state ────────────────────────────────────────────────────────

  private final GameState gs;
  private final MoveRequest moveMessage;
  private final MoveResponse response;

  private Pawn pawn1;
  private Pawn pawn2;
  private Card card;
  private String playerId;
  private int nrStepsPawn1;
  private int nrStepsPawn2;
  private MoveRequest moveMessagePawn1;
  private MoveRequest moveMessagePawn2;
  private MoveResponse moveResponsePawn1;
  private MoveResponse moveResponsePawn2;

  private ProcessOnSplit(GameState gs, MoveRequest moveMessage, MoveResponse response) {
    this.gs = gs;
    this.moveMessage = moveMessage;
    this.response = response;
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  private void execute() {
    pawn1 = gs.getPawn(moveMessage.getPawn1Id());
    pawn2 = gs.getPawn(moveMessage.getPawn2Id());
    card = gs.getCard(moveMessage.getCardId(), moveMessage.getPlayerId());

    if (!selectionIsValid()) return;

    // The card is played from the MOVER's hand, which in team play is not the pawns' owner —
    // you play your teammate's pawns once all of your own are home. ProcessOnMove still checks,
    // per pawn, that the mover is allowed to control it.
    playerId = moveMessage.getPlayerId();
    nrStepsPawn1 = moveMessage.getStepsPawn1();
    nrStepsPawn2 = moveMessage.getStepsPawn2();

    if (!pawnsAreSamePlayer()) return;
    if (!cardIsSeven()) return;
    // The single-move path guards this in GameState.processMove; the split path must too, so a
    // played 7 can't be re-used even for a CHECK preview.
    if (!requireCardHeld(gs, playerId, card, response)) return;
    if (!stepsAddUpToSeven()) return;

    buildSplitMoveRequests();

    if (!bothPawnMovesAreValid()) return;

    if (gs.isMakeMove(moveMessage)) {
      if (!executeSplitMoves()) return;
    }

    buildSplitResponse();
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private boolean selectionIsValid() {
    if (pawn1 == null || card == null || pawn2 == null) {
      reject(response, INVALID_SELECTION, MoveRejectionReason.INVALID_SELECTION);
      return false;
    }
    return true;
  }

  private boolean pawnsAreSamePlayer() {
    if (!pawn1.getPlayerId().equals(pawn2.getPlayerId())) {
      reject(response, CANNOT_MAKE_MOVE, MoveRejectionReason.SPLIT_NEEDS_TWO_OWN_PAWNS);
      return false;
    }
    return true;
  }

  private boolean cardIsSeven() {
    if (!isSeven(card)) {
      reject(response, PLAYER_DOES_NOT_HAVE_CARD, MoveRejectionReason.WRONG_CARD_FOR_MOVE);
      return false;
    }
    return true;
  }

  private boolean stepsAddUpToSeven() {
    if (nrStepsPawn1 + nrStepsPawn2 != 7) {
      reject(response, INVALID_SELECTION, MoveRejectionReason.SPLIT_STEPS_NOT_SEVEN);
      return false;
    }
    return true;
  }

  // ── Move request setup ────────────────────────────────────────────────────

  private void buildSplitMoveRequests() {
    moveMessagePawn1 = buildCheckMoveRequest(moveMessage.getPawn1Id(), nrStepsPawn1);
    moveMessagePawn2 = buildCheckMoveRequest(moveMessage.getPawn2Id(), nrStepsPawn2);
  }

  private MoveRequest buildCheckMoveRequest(PawnId pawnId, int nrSteps) {
    MoveRequest req = new MoveRequest();
    req.setPlayerId(playerId);
    req.setCardId(card.getUuid());
    req.setStepsPawn1(nrSteps);
    req.setPawn1Id(pawnId);
    req.setTempMessageType(CHECK_MOVE);
    req.setMoveType(SPLIT);
    return req;
  }

  // ── Move validation ───────────────────────────────────────────────────────

  private boolean bothPawnMovesAreValid() {
    Pawn backupPawn1 = createBackupOfPawn1();

    moveResponsePawn1 = new MoveResponse();
    ProcessOnMove.process(gs, moveMessagePawn1, moveResponsePawn1);
    if (moveResponsePawn1.getResult().equals(CANNOT_MAKE_MOVE)) {
      // Surface the reason the first pawn's part of the split could not be made.
      reject(response, moveResponsePawn1.getResult(),
          moveResponsePawn1.getRejectionReason(), moveResponsePawn1.getRejectionDetail());
      return false;
    }

    temporarilyMovePawn1ToCheckPosition();
    moveResponsePawn2 = new MoveResponse();
    ProcessOnMove.process(gs, moveMessagePawn2, moveResponsePawn2);
    restorePawn1(backupPawn1);

    if (moveResponsePawn2.getResult().equals(CANNOT_MAKE_MOVE)) {
      // Surface the reason the second pawn's part of the split could not be made.
      reject(response, moveResponsePawn2.getResult(),
          moveResponsePawn2.getRejectionReason(), moveResponsePawn2.getRejectionDetail());
      return false;
    }

    return true;
  }

  private Pawn createBackupOfPawn1() {
    return new Pawn(
        pawn1.getPlayerId(),
        pawn1.getPawnId(),
        gs.getPawn(moveMessagePawn1.getPawn1Id()).getCurrentTileId(),
        pawn1.getNestTileId());
  }

  private void temporarilyMovePawn1ToCheckPosition() {
    gs.movePawn(new Pawn(
        pawn1.getPlayerId(),
        pawn1.getPawnId(),
        moveResponsePawn1.getMovePawn1().getLast(),
        pawn1.getNestTileId()));
  }

  private void restorePawn1(Pawn backup) {
    gs.movePawn(new Pawn(
        pawn1.getPlayerId(),
        pawn1.getPawnId(),
        backup.getCurrentTileId(),
        pawn1.getNestTileId()));
  }

  // ── Move execution ────────────────────────────────────────────────────────

  private boolean executeSplitMoves() {
    if (moveMessage.getStepsPawn1() + moveMessage.getStepsPawn2() != 7) {
      reject(response, INVALID_SELECTION, MoveRejectionReason.SPLIT_STEPS_NOT_SEVEN);
      return false;
    }
    gs.duplicatePlayerCard(playerId, card);
    moveMessagePawn1.setTempMessageType(MAKE_MOVE);
    moveMessagePawn2.setTempMessageType(MAKE_MOVE);
    ProcessOnMove.process(gs, moveMessagePawn1, moveResponsePawn1, false);
    ProcessOnMove.process(gs, moveMessagePawn2, moveResponsePawn2, true);
    return true;
  }

  // ── Response assembly ─────────────────────────────────────────────────────

  private void buildSplitResponse() {
    response.setPawn1(gs.getPawn(moveMessage.getPawn1Id()));
    response.setPawn2(gs.getPawn(moveMessage.getPawn2Id()));
    response.setMovePawn1(moveResponsePawn1.getMovePawn1());
    response.setMovePawn2(moveResponsePawn2.getMovePawn1());
    if (moveResponsePawn1.getMovePawnKilledByPawn1() != null) {
      response.setPawnKilledByPawn1(moveResponsePawn1.getPawnKilledByPawn1());
      response.setMovePawnKilledByPawn1(moveResponsePawn1.getMovePawnKilledByPawn1());
    }
    if (moveResponsePawn2.getMovePawnKilledByPawn2() != null) {
      response.setPawnKilledByPawn2(moveResponsePawn2.getPawnKilledByPawn1());
      response.setMovePawnKilledByPawn2(moveResponsePawn2.getMovePawnKilledByPawn1());
    }
    response.setResult(CAN_MAKE_MOVE);
    response.setMoveType(SPLIT);
  }
}