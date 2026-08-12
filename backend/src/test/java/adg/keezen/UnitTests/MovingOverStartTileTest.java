package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.MoveResult;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MovingOverStartTileTest {

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

  // moving
  @Test
  void passingStartTile1_0Forward_NotPossibleWhenPlayerIsThere_PawnMovesBackwards() {
    // when the pawn is on position 15 and takes two steps it will end up at position 13

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 2);
    Pawn pawn1 = GameStateUtil.placePawnOnNest(gameState, "0", new PositionKey("0", 15));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response is correct
    assertEquals(
        new PositionKey("0", 13),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN GameState is correct
    assertEquals(new PositionKey("0", 13), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void movingOverStartTile0_0Forwards_NotPossibleWhenPlayerIsThere_PawnMovesBackwards() {
    // when the pawn is on position 15 and takes two steps it will end up at position 13

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 12);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 0));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("7", 10));

    // WHEN
    createMoveRequest(moveMessage, pawn2, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response is correct
    assertEquals(
        new PositionKey("7", 8),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn2.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN GameState is correct
    assertEquals(new PositionKey("7", 8), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void passingStartTile1_0Forward_NotPossibleWhenPlayerIsThere_PawnMovesForwardAndBack() {
    // when the pawn is on position 14 and takes 5 steps it will end up at position 11

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 5);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 14));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response msg is correct
    assertEquals(
        new PositionKey("0", 11),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN GameState is correct
    assertEquals(new PositionKey("0", 11), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void passingStartTile0_0Backwards_NotPossibleWhenPlayerIsThere_PawnMovesForward() {
    // when the pawn is on position 14 and takes 5 steps it will end up at position 11

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -5);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 0));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("0", 3));

    // WHEN
    createMoveRequest(moveMessage, pawn2, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response msg is correct
    assertEquals(
        new PositionKey("0", 4),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn2.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN GameState is correct
    assertEquals(new PositionKey("0", 4), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void endUpOnStartTile0_0Backwards_MoveForward() {
    // when the pawn is on position 14 and takes 5 steps it will end up at position 11

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -3);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 0));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("0", 3));

    // WHEN
    createMoveRequest(moveMessage, pawn2, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response msg is correct
    assertEquals(
        new PositionKey("0", 2),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn2.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN GameState is correct
    assertEquals(new PositionKey("0", 2), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void passingStartTile1_0Backward_NotPossibleWhenPlayerIsThere_PawnMovesForward() {
    // when the pawn is on position 2 and takes -4 steps it will end up at position 4

    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -4);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("1", 2));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("1", 4),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", 4), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void passingStartTile1_0Backward_PossibleWhenOtherPlayerIsThere_PawnMovesBackward() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -4);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("1", 2));
    Pawn pawn2 = placePawnOnNest(gameState, "0", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(
        new PositionKey("0", 14),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 14), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void PawnMovesBackward_EndsOnStart() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -1);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("1", 1));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(
        new PositionKey("1", 0),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", 0), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void PawnMovesForward_EndsOnStart() {
    // GIVEN
    Card ace = givePlayerAce(cardsDeck, 1);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("1", 15));

    // WHEN
    createMoveRequest(moveMessage, pawn1, ace);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("2", 0),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("2", 0), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void pawnOnNestTile_DoesNotMove() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 10);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("1", -2));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty()); // moves the pawn to the correct tile
    assertNull(moveResponse.getPawn1()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", -2), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void PawnMovesBackwardFromStartTile1_0ToPreviousSection() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -1);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("0", 15),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 15), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void PawnMovesBackwardFromStartTile0_0ToPreviousSection() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -4);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("7", 12),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("7", 12), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void pawnEndOnOccupiedStartTileBackwards_Blockade_EndsOnTile2() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 4));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(
        new PositionKey("0", 2),
        moveResponse.getMovePawn1().getLast()); // moves the pawn to the correct tile
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 2), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void pawnEndOnOccupiedStartTileBackwards_NoBlockade_CannotMove() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("0", 4));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("0", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertNull(moveResponse.getPawn1()); // moves the correct pawn
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 4), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void pawnEndOnOccupiedStartTileBackwards_Tile2IsAlsoOccupied_CannotMove() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 4));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 0));
    Pawn pawn3 = placePawnOnBoard(gameState, new PawnId("0", 3), new PositionKey("0", 2));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertTrue(moveResponse.getMovePawn1().isEmpty());
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 4), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void pawnEndOnOccupiedStartTileForwards_NoBlockade_CannotMove() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("7", 12));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("0", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertNull(moveResponse.getPawn1());
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("7", 12), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void pawnEndOnOccupiedStartTileForwards_Blockade_EndsOnTile14() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("7", 12));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId());
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("7", 14), moveResponse.getMovePawn1().getLast());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("7", 14), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void pawnEndOnOccupiedStartTileForwards_Blockade_Tile14IsAlsoOccupied_CannotMove() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("7", 12));
    Pawn pawn2 = placePawnOnNest(gameState, "0", new PositionKey("0", 0));
    Pawn pawn3 = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("7", 14));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertTrue(moveResponse.getMovePawn1().isEmpty()); // moves the pawn to the correct tile
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("7", 12), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void canPassStartTileSamePlayerWhenPawnOnDifferentStartTile() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 2, 4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("2", 1), new PositionKey("0", 15));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("2", 2), new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId());
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("1", 3), moveResponse.getMovePawn1().getLast());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", 3), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void canPassStartTileBackWards_SamePlayer_WhenPawnOnDifferentStartTile() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 2, -4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("2", 1), new PositionKey("1", 2));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("2", 2), new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId());
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("0", 14), moveResponse.getMovePawn1().getLast());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 14), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void canPassStartTile_DifferentPlayerOnDifferentStartTile() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 2, 4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("2", 1), new PositionKey("0", 15));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId());
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("1", 3), moveResponse.getMovePawn1().getLast());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", 3), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void canPassStartTileBackwards_DifferentPlayerOnDifferentStartTile() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 2, -4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("2", 1), new PositionKey("1", 2));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(pawn1.getPawnId(), moveResponse.getPawn1().getPawnId());
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("0", 14), moveResponse.getMovePawn1().getLast());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 14), gameState.getPawn(pawn1).getCurrentTileId());
  }
}
