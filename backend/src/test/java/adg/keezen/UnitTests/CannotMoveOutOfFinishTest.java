package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnMove;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Verifies the cannotMoveOutOfFinish option: a pawn that has reached the finish can never leave
 * it again. The four is the only card that moves backwards, so it is the only one that can pull a
 * pawn back out onto the board.
 *
 * <p>Board layout (8 players, playerInt = index):
 *   Section "0" tiles 0-15  →  "1" tiles 0-15  →  ... →  "7" tiles 0-15
 *   Player "1" finish tiles: (1,16)-(1,19)
 *   Last section before player "1"'s finish: section "0"
 */
class CannotMoveOutOfFinishTest {

  private MoveRequest moveMessage;
  private MoveResponse moveResponse;

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();
    createGame_With_NPlayers(gameState, 8);
    gameState.setCannotMoveOutOfFinish(true);
    moveMessage = new MoveRequest();
    moveResponse = new MoveResponse();
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
    moveMessage = null;
    moveResponse = null;
    cardsDeck.reset();
  }

  @Test
  void pawnOnFinish_TakingFourStepsBack_CannotLeaveTheFinish() {
    // pawn "1" at (1,19) - 4 steps → would land on (0,15), back on the main board.
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -4);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("1", 19));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(
        MoveRejectionReason.CANNOT_MOVE_OUT_OF_FINISH, moveResponse.getRejectionReason());
    assertNull(moveResponse.getPawn1()); // no pawn was moved
    // THEN Gamestate is correct — the pawn has not budged
    assertEquals(new PositionKey("1", 19), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void pawnOnFinish_TakingFourStepsBack_IsAllowedWhenOptionDisabled() {
    // The same move as above, with the option off — it must behave exactly as it always has, so
    // switching the option on is the only thing that ever changes this outcome.
    // GIVEN
    gameState.setCannotMoveOutOfFinish(false);
    Card card = givePlayerCard(cardsDeck, 1, -4);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("1", 19));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("0", 15), moveResponse.getMovePawn1().getLast());
    // THEN Gamestate is correct — the pawn is back on the main board
    assertEquals(new PositionKey("0", 15), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void pawnOnFinish_BouncingFourThatStaysInTheFinish_IsStillAllowed() {
    // A four does not always leave the finish: with an own pawn walling off (1,16), the pawn at
    // (1,17) bounces off it, off the closed end at (1,19), and comes to rest back on (1,17) —
    // never leaving the lane. The rule is about where the pawn LANDS, not about the card, so this
    // move stays legal even with the option on.
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -4);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("1", 17));
    placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16)); // the wall

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("1", 17), moveResponse.getMovePawn1().getLast());
    // THEN Gamestate is correct — still on the finish, where it bounced back to
    assertEquals(new PositionKey("1", 17), gameState.getPawn(pawn1).getCurrentTileId());
  }
}
