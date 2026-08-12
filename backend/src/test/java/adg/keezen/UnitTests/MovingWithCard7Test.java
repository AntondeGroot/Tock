package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static com.adg.openapi.model.TempMessageType.CHECK_MOVE;
import static org.junit.jupiter.api.Assertions.assertEquals;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import java.util.LinkedList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class MovingWithCard7Test {

  private MoveRequest moveMessage = new MoveRequest();
  private MoveResponse moveResponse = new MoveResponse();

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();

    createGame_With_NPlayers(gameState, 8);
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
  void test_moveTwoPawns_correct() {
    // when the pawn is on position 15 and takes two steps it will end up at position 13

    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 0));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 10));

    // WHEN
    createSplitMessage(moveMessage, pawn1, 4, pawn2, 3, card);
    gameState.processOnSplit(moveMessage, moveResponse);

    // THEN response is correct
    assertEquals(new PositionKey("0", 4), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(
        new PositionKey("0", 4),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile

    assertEquals(new PositionKey("0", 13), gameState.getPawn(pawn2).getCurrentTileId());
    assertEquals(
        new PositionKey("0", 13),
        moveResponse.getMovePawn2().getLast()); // moves the pawn to the correct tile
  }

  @Test
  void test_moveTwoPawns_TestSplitForBothPawns_OneGoesToNextSegment() {
    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 0));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 14));

    // WHEN no decision was made how to split the 7 among the two pawns
    createSplitMessage(moveMessage, pawn1, 3, pawn2, 4, card);
    moveMessage.setTempMessageType(CHECK_MOVE);
    gameState.processOnSplit(moveMessage, moveResponse);

    LinkedList<PositionKey> expectedTilesPawn1 = new LinkedList<>();
    expectedTilesPawn1.add(new PositionKey("0", 0));
    expectedTilesPawn1.add(new PositionKey("0", 1));
    expectedTilesPawn1.add(new PositionKey("0", 3));

    LinkedList<PositionKey> expectedTilesPawn2 = new LinkedList<>();
    expectedTilesPawn2.add(new PositionKey("0", 14));
    expectedTilesPawn2.add(new PositionKey("0", 15));
    expectedTilesPawn2.add(new PositionKey("1", 1));
    expectedTilesPawn2.add(new PositionKey("1", 2));

    // THEN
    assertEquals(expectedTilesPawn1, moveResponse.getMovePawn1());
    assertEquals(expectedTilesPawn2, moveResponse.getMovePawn2());
  }

  @Test
  void test_moveTwoPawns_Pawn1WasOnFinish_OldPositionDoesNotBlockTestMovePawn2() {
    // bugfix, test move did not show it correctly, however when playing the card it did place the
    // pawns correctly. Assume the first pawn selected moves first

    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 16));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("7", 14));

    // WHEN
    createSplitMessage(moveMessage, pawn1, 3, pawn2, 4, card);
    moveMessage.setTempMessageType(CHECK_MOVE);
    gameState.processOnSplit(moveMessage, moveResponse);

    // THEN
    assertEquals(new PositionKey("0", 19), moveResponse.getMovePawn1().getLast());
    assertEquals(new PositionKey("0", 18), moveResponse.getMovePawn2().getLast());
  }

  @Test
  void checkMove_sevenSplit_pawn2HasZeroSteps_shouldHighlightPawn1Destination() {
    // When pawn2 moves 0 steps it stays in place. The validator must not treat the pawn
    // at pawn2's current tile as a blocking own-pawn, because it IS pawn2 itself.
    // Before the fix, cannotMoveToTileBecauseSamePlayer compared PawnId to Pawn (always
    // unequal), so a 0-step move always returned CANNOT_MAKE_MOVE.

    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 3));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 8));

    // WHEN: pawn1 moves 7, pawn2 moves 0
    createSplitMessage(moveMessage, pawn1, 7, pawn2, 0, card);
    moveMessage.setTempMessageType(CHECK_MOVE);
    gameState.processOnSplit(moveMessage, moveResponse);

    // THEN: valid — pawn1 ends at tile 10, pawn2 stays at tile 8
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("0", 10), moveResponse.getMovePawn1().getLast());
    assertEquals(new PositionKey("0", 8),  moveResponse.getMovePawn2().getLast());
  }

  @Test
  void checkMove_sevenSplit_pawn1HasZeroSteps_shouldHighlightPawn2Destination() {
    // Mirror of the above: pawn1 gets 0 steps, pawn2 gets all 7.

    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 8));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 3));

    // WHEN: pawn1 moves 0, pawn2 moves 7
    createSplitMessage(moveMessage, pawn1, 0, pawn2, 7, card);
    moveMessage.setTempMessageType(CHECK_MOVE);
    gameState.processOnSplit(moveMessage, moveResponse);

    // THEN: valid — pawn1 stays at tile 8, pawn2 ends at tile 10
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("0", 8),  moveResponse.getMovePawn1().getLast());
    assertEquals(new PositionKey("0", 10), moveResponse.getMovePawn2().getLast());
  }

  @Test
  void makeMove_sevenSplit_pawn2HasZeroSteps_pawnPositionsAreCorrect() {
    // Confirm the actual MAKE_MOVE also works: pawn1 advances, pawn2 stays put.

    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 3));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 8));

    // WHEN: pawn1 moves 7, pawn2 moves 0
    createSplitMessage(moveMessage, pawn1, 7, pawn2, 0, card);
    gameState.processOnSplit(moveMessage, moveResponse);

    // THEN: pawn1 is at tile 10, pawn2 is still at tile 8
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("0", 10), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 8),  gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void CheckMove_moveTwoPawns_EndOnSameTile_CannotMove() {
    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 5));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 2));

    // WHEN
    createSplitMessage(moveMessage, pawn1, 2, pawn2, 5, card);
    moveMessage.setTempMessageType(CHECK_MOVE);
    gameState.processOnSplit(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
  }

  @Test
  void MakeMove_moveTwoPawns_EndOnSameTile_CannotMove() {
    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 5));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 2));

    // WHEN
    createSplitMessage(moveMessage, pawn1, 2, pawn2, 5, card);
    gameState.processOnSplit(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("0", 5), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 2), gameState.getPawn(pawn2).getCurrentTileId());
  }
}
