package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnMove;
import adg.processing.ProcessOnSplit;
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

class MovingAndKillTest {

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
    moveMessage = null;
    moveResponse = null;
  }

  @Test
  void KillPawnOnNormalTile_Forward() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 1);
    Pawn pawn1 = GameStateUtil.placePawnOnNest(gameState, "0", new PositionKey("0", 9));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("0", 10));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("0", 10),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(
        pawn2.getNestTileId(),
        moveResponse.getMovePawnKilledByPawn1().getLast()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 10), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(pawn2.getNestTileId(), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void KillPawnOnNormalTile_Backward() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -1);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 11));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("0", 10));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN
    LinkedList<PositionKey> expectedMovement = new LinkedList<>();
    expectedMovement.add(new PositionKey("0", 10));
    expectedMovement.add(pawn2.getNestTileId());

    // THEN response message is correct
    assertEquals(
        new PositionKey("0", 10),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(
        expectedMovement, moveResponse.getMovePawnKilledByPawn1()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 10), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(pawn2.getNestTileId(), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void KillPawnOnOtherStartTile_Forward() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 1);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 15));
    Pawn pawn2 = placePawnOnNest(gameState, "2", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("1", 0),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(
        pawn2.getNestTileId(),
        moveResponse.getMovePawnKilledByPawn1().getLast()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", 0), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(pawn2.getNestTileId(), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void KillPawnOnOtherStartTile_Backward() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -1);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("1", 1));
    Pawn pawn2 = placePawnOnNest(gameState, "2", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("1", 0),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(
        pawn2.getNestTileId(),
        moveResponse.getMovePawnKilledByPawn1().getLast()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", 0), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(pawn2.getNestTileId(), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void KillPawnOnSection_Forward() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 12);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 9));
    Pawn pawn2 = placePawnOnNest(gameState, "2", new PositionKey("1", 5));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("1", 5),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(
        pawn2.getNestTileId(),
        moveResponse.getMovePawnKilledByPawn1().getLast()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", 5), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(pawn2.getNestTileId(), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void KillPawnOnSection_Backward() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -12);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("1", 5));
    Pawn pawn2 = placePawnOnNest(gameState, "2", new PositionKey("0", 9));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("0", 9),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(
        pawn2.getNestTileId(),
        moveResponse.getMovePawnKilledByPawn1().getLast()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 9), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(pawn2.getNestTileId(), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void killPawnWith7CardPawn1() {
    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 0));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 14));
    Pawn otherPawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("0", 3));

    // WHEN no decision was made how to split the 7 among the two pawns
    createSplitMessage(moveMessage, pawn1, 3, pawn2, 4, card);
    ProcessOnSplit.process(gameState, moveMessage, moveResponse);

    // THEN
    assertEquals(otherPawn1.getNestTileId(), gameState.getPawn(otherPawn1).getCurrentTileId());
    assertEquals(otherPawn1.getPawnId(), moveResponse.getPawnKilledByPawn1().getPawnId());
    assertNull(moveResponse.getPawnKilledByPawn2());
  }

  @Test
  void killPawnWith7CardPawn2() {
    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 0));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 6));
    Pawn otherPawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("0", 8));

    // WHEN no decision was made how to split the 7 among the two pawns
    createSplitMessage(moveMessage, pawn1, 5, pawn2, 2, card);
    ProcessOnSplit.process(gameState, moveMessage, moveResponse);

    // THEN
    assertEquals(otherPawn1.getNestTileId(), gameState.getPawn(otherPawn1).getCurrentTileId());
    assertEquals(otherPawn1.getPawnId(), moveResponse.getPawnKilledByPawn2().getPawnId());
    assertNull(moveResponse.getPawnKilledByPawn1());
  }
}
