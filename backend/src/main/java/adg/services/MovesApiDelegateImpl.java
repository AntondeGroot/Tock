package adg.services;

import static com.adg.openapi.model.TempMessageType.CHECK_MOVE;
import static com.adg.openapi.model.TempMessageType.MAKE_MOVE;

import adg.keezen.GameRegistry;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnBoard;
import adg.processing.ProcessOnMove;
import adg.processing.ProcessOnSplit;
import adg.processing.ProcessOnSwitch;
import adg.processing.SevenSplitRecommender;
import adg.util.PawnAndCardSelectionValidation;
import adg.util.SelectionValidation;
import com.adg.openapi.api.MovesApiDelegate;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.MoveResult;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.TestMoveResponse;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

@Service
public class MovesApiDelegateImpl implements MovesApiDelegate {

  private static final Logger log = LoggerFactory.getLogger(MovesApiDelegateImpl.class);

  @Autowired
  private SseEmitterService sseEmitterService;

  @Override
  public ResponseEntity<TestMoveResponse> checkMove(
      String sessionId, String playerId, MoveRequest moveRequest) {
    moveRequest.setTempMessageType(CHECK_MOVE);
    ResponseEntity<MoveResponse> result = dispatchMove(sessionId, playerId, moveRequest);
    if (!result.getStatusCode().is2xxSuccessful()) {
      return ResponseEntity.status(result.getStatusCode()).build();
    }
    MoveResponse move = result.getBody();
    if (move == null) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }
    TestMoveResponse testMoveResponse = new TestMoveResponse();
    if (move.getMovePawn1() != null && !move.getMovePawn1().isEmpty()) {
      testMoveResponse.addTilesItem(move.getMovePawn1().getLast());
    }
    if (move.getMovePawn2() != null && !move.getMovePawn2().isEmpty()) {
      testMoveResponse.addTilesItem(move.getMovePawn2().getLast());
    }

    // For a 7-split, suggest the allocation that lands a pawn deepest in the finish (the obvious
    // intent). Pawn order is preserved and only valid splits are suggested; null when N/A.
    GameSession session = GameRegistry.getGame(sessionId);
    if (session != null) {
      int[] recommended = SevenSplitRecommender.recommend(session.getGameState(), moveRequest);
      if (recommended != null) {
        testMoveResponse.setRecommendedStepsPawn1(recommended[0]);
        testMoveResponse.setRecommendedStepsPawn2(recommended[1]);
      }
    }
    return ResponseEntity.ok(testMoveResponse);
  }

  @Override
  public ResponseEntity<MoveResponse> makeMove(
      String sessionId, String playerId, MoveRequest moveRequest) {
    moveRequest.setTempMessageType(MAKE_MOVE);
    return dispatchMove(sessionId, playerId, moveRequest);
  }

  @Override
  public ResponseEntity<MoveResponse> getLastMove(String sessionId) {
    GameSession session = Games.require(sessionId);
    MoveResponse last = session.getLastMoveResponse();
    if (last == null) {
      return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }
    return ResponseEntity.ok(last);
  }

  private ResponseEntity<MoveResponse> dispatchMove(
      String sessionId, String playerId, MoveRequest moveRequest) {
    GameSession gameSession = Games.require(sessionId);
    GameState gameState = gameSession.getGameState();

    if (moveRequest.getTempMessageType() == MAKE_MOVE
        && !Objects.equals(playerId, gameState.getPlayerIdTurn())) {
      return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
    }

    if (moveRequest.getCardId() == null || moveRequest.getPawn1Id() == null) {
      return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
    }

    Card card = gameState.getCard(moveRequest.getCardId(), moveRequest.getPlayerId());
    Pawn pawn1 = gameState.getPawn(moveRequest.getPawn1Id());
    Pawn pawn2 = gameState.getPawn(moveRequest.getPawn2Id());
    SelectionValidation validation = PawnAndCardSelectionValidation.validate(pawn1, pawn2, card);

    if (!validation.isValid()) {
      return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
    }

    MoveResponse response = new MoveResponse();
    // Team-play hand-off: you must finish your own pawns before playing a teammate's. Gated
    // here so every move type (and the preview) inherits it; a no-op when teams are off.
    if (!gameState.isTeamMoveAllowed(playerId, pawn1)) {
      response.setResult(MoveResult.CANNOT_MAKE_MOVE);
      response.setRejectionReason(MoveRejectionReason.MUST_FINISH_OWN_PAWNS_FIRST);
      return new ResponseEntity<>(response, HttpStatus.OK);
    }
    switch (validation.getMoveType()) {
      case MOVE -> ProcessOnMove.process(gameState, moveRequest, response);
      case SPLIT -> ProcessOnSplit.process(gameState, moveRequest, response);
      case SWITCH -> ProcessOnSwitch.process(gameState, moveRequest, response);
      case ON_BOARD -> ProcessOnBoard.process(gameState, moveRequest, response);
    }

    if (moveRequest.getTempMessageType() == MAKE_MOVE) {
      gameSession.setLastMoveResponse(response);
      log.info("Move made: sessionId={} playerId={} card={} type={}",
          sessionId, playerId, moveRequest.getCardId(), validation.getMoveType());
      sseEmitterService.push(sessionId, gameSession);
    }

    return new ResponseEntity<>(response, HttpStatus.OK);
  }
}