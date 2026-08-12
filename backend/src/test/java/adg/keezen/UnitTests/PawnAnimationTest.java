package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static org.junit.jupiter.api.Assertions.assertEquals;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.Log;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import java.util.LinkedList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class PawnAnimationTest {

  MoveRequest moveMessage = new MoveRequest();
  MoveResponse moveResponse = new MoveResponse();

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
    cardsDeck.reset();
    moveMessage = null;
    moveResponse = null;
  }

  @Test
  void pawnMovesAroundCorner7() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 4);
    Pawn pawn1 = GameStateUtil.placePawnOnNest(gameState, "0", new PositionKey("0", 5));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 5));
    expectedMovement.add(new PositionKey("0", 7));
    expectedMovement.add(new PositionKey("0", 9));

    // response message is correct
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMovesAroundCorner1() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 3);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 0));
    expectedMovement.add(new PositionKey("0", 1));
    expectedMovement.add(new PositionKey("0", 3));

    // response message is correct
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMovesAroundCorner13And0() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 2, 8);
    Pawn pawn1 = placePawnOnNest(gameState, "2", new PositionKey("0", 12));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 12));
    expectedMovement.add(new PositionKey("0", 13));
    expectedMovement.add(new PositionKey("0", 15));
    expectedMovement.add(new PositionKey("1", 1));
    expectedMovement.add(new PositionKey("1", 4));

    // response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMoveFrom9To12() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 3);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 9));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 9));
    expectedMovement.add(new PositionKey("0", 12));

    // response message is correct
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMoveFrom11To1() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 2, 6);
    Pawn pawn1 = placePawnOnNest(gameState, "2", new PositionKey("0", 11));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 11));
    expectedMovement.add(new PositionKey("0", 13));
    expectedMovement.add(new PositionKey("0", 15));
    expectedMovement.add(new PositionKey("1", 1));

    // response message is correct
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMoveHitsAllCorners() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 2, 19);
    Pawn pawn1 = placePawnOnNest(gameState, "2", new PositionKey("0", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 0));
    expectedMovement.add(new PositionKey("0", 1));
    expectedMovement.add(new PositionKey("0", 7));
    expectedMovement.add(new PositionKey("0", 13));
    expectedMovement.add(new PositionKey("0", 15));
    expectedMovement.add(new PositionKey("1", 1));
    expectedMovement.add(new PositionKey("1", 3));

    // response message is correct
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMovesIntoFinishAndOvershoots() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 5);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("0", 15));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 15));
    expectedMovement.add(new PositionKey("1", 19));
    expectedMovement.add(new PositionKey("1", 18));

    // response message is correct
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMovesBackwardsOverCorners15_13_7_1() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -12);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("1", 16));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("1", 16));
    expectedMovement.add(new PositionKey("0", 15));
    expectedMovement.add(new PositionKey("0", 13));
    expectedMovement.add(new PositionKey("0", 7));
    expectedMovement.add(new PositionKey("0", 4));

    // response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMovesBackwardsOverCorners13_7() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -8);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 14));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 14));
    expectedMovement.add(new PositionKey("0", 13));
    expectedMovement.add(new PositionKey("0", 7));
    expectedMovement.add(new PositionKey("0", 6));

    // response message is correct
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMovesBackwardsOverCorners7() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -4);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 8));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 8));
    expectedMovement.add(new PositionKey("0", 7));
    expectedMovement.add(new PositionKey("0", 4));

    // response message is correct
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMovesForwards_13_7_1_ToNewSection() {
    // setup
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 8);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("2", 12));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("0", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("2", 12));
    expectedMovement.add(new PositionKey("2", 13));
    expectedMovement.add(new PositionKey("2", 15));
    expectedMovement.add(new PositionKey("0", 1));
    expectedMovement.add(new PositionKey("0", 4));

    // response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnSwitchesWithOpponent() {
    // setup
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);

    // GIVEN
    Card card = givePlayerJack(cardsDeck, 0);
    PositionKey tile1 = new PositionKey("2", 12);
    PositionKey tile2 = new PositionKey("0", 5);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), tile1);
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 2), tile2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card);
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovementPawn1 = new LinkedList<>();
    expectedMovementPawn1.add(tile1);
    expectedMovementPawn1.add(tile2);

    LinkedList<PositionKey> expectedMovementPawn2 = new LinkedList<>();
    expectedMovementPawn2.add(tile2);
    expectedMovementPawn2.add(tile1);

    // response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(expectedMovementPawn2, moveResponse.getMovePawn2());
    assertEquals(expectedMovementPawn1, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMoves_FinishIsFull_AnimateToRightTile_BugFix() {
    /**
     * When the finish tile (1,16) is taken for player1 And player 1 tries to move onto it: The
     * animation animates a move to tile (1,15) instead of tile (0,15) it also had the points (0,15)
     * (1,15) (0,15) so it would unnecessarily be doubled.
     */

    // setup
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 8);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("0", 12));

    // WHEN
    createMoveRequest(moveMessage, pawn2, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 12));
    expectedMovement.add(new PositionKey("0", 13));
    expectedMovement.add(new PositionKey("0", 15));
    expectedMovement.add(new PositionKey("0", 13));
    expectedMovement.add(new PositionKey("0", 10));

    // response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMoves_PingPong_3StepsOnFinish_test() {
    // setup
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 3);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 17));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 19));
    Pawn pawn3 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("1", 16));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));

    // response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMoves_PingPong_9StepsOnFinish_test() {
    // setup
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 9);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 17));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 19));
    Pawn pawn3 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("1", 16));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));

    // response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(expectedMovement, moveResponse.getMovePawn1());
  }

  @Test
  void pawnMoves_PingPongMethod_9StepsOnFinish_test() {
    // setup
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);

    // GIVEN
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 17));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 19));
    Pawn pawn3 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("1", 16));

    // WHEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));

    ArrayList<PositionKey> actualMovement =
        gameState.pingpongMove(pawn1, pawn1.getCurrentTileId(), 9);
    // THEN
    Log.info(actualMovement.toString());
    assertEquals(expectedMovement, actualMovement);
  }

  @Test
  void pawnMoves_PingPongMethod_6StepsOnFinish_3places_test() {
    // setup
    int nrSteps = 6;
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);

    // GIVEN
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 17));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("1", 16));

    // WHEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 19));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 19));

    ArrayList<PositionKey> actualMovement =
        gameState.pingpongMove(pawn1, pawn1.getCurrentTileId(), nrSteps);
    // THEN
    Log.info(actualMovement.toString());
    assertEquals(expectedMovement, actualMovement);
  }

  @Test
  void pawnMoves_PingPongMethod_5StepsOnFinish_3places_test() {
    // setup
    int nrSteps = 5;
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);

    // GIVEN
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 17));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("1", 16));

    // WHEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 19));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));

    ArrayList<PositionKey> actualMovement =
        gameState.pingpongMove(pawn1, pawn1.getCurrentTileId(), nrSteps);
    // THEN
    Log.info(actualMovement.toString());
    assertEquals(expectedMovement, actualMovement);
  }

  @Test
  void pawnMoves_PingPongMethod_Negative4StepsOnFinish_3places_test() {
    // setup
    int nrSteps = -4;
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);

    // GIVEN
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 17));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("1", 16));

    // WHEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 19));
    expectedMovement.add(new PositionKey("1", 17));

    ArrayList<PositionKey> actualMovement =
        gameState.pingpongMove(pawn1, pawn1.getCurrentTileId(), nrSteps);
    // THEN
    Log.info(actualMovement.toString());
    assertEquals(expectedMovement, actualMovement);
  }

  @Test
  void pawnMoves_PingPongMethod_Negative4StepsOnFinish_test() {
    // setup
    gameState.tearDown();
    createGame_With_NPlayers(gameState, 3);
    int nrSteps = -4;

    // GIVEN
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 17));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 19));
    Pawn pawn3 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("1", 16));

    // WHEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));
    expectedMovement.add(new PositionKey("1", 18));
    expectedMovement.add(new PositionKey("1", 17));

    ArrayList<PositionKey> actualMovement =
        gameState.pingpongMove(pawn1, pawn1.getCurrentTileId(), nrSteps);
    // THEN
    Log.info(actualMovement.toString());
    assertEquals(expectedMovement, actualMovement);
  }
}
