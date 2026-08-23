package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static org.junit.Assert.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnMove;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MovingOnBoardSamePlayerBlockingTest {

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
    cardsDeck.reset();
  }

  @Test
  void twoPawnsOnePlayer_CannotEndOnTheSameTile() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 1);
    Pawn pawn1 =
        GameStateUtil.placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 9));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 10));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty()); // moves the pawn to the correct tile
    assertNull(moveResponse.getPawn1()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 9), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 10), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void twoPawnsOnePlayer_CannotEndOnTheSameTile_DoesNotPlayCard() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 16));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("7", 15));
    int nrCardsBeforePlaying = cardsDeck.getCardsForPlayer("0").size();

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(nrCardsBeforePlaying, cardsDeck.getCardsForPlayer("0").size());
  }

  @Test
  void PawnOn15_PawnCannotBePlacedThere_Forwards() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 14));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 15));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty()); // moves the pawn to the correct tile
    assertNull(moveResponse.getPawn1()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 14), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 15), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void PawnOn15_PawnCannotBePlacedThere_Backwards() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("1", 0));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 15));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty());
    assertNull(moveResponse.getPawn1());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", 0), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 15), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void PawnOnOtherStart_PawnCannotBePlacedThere_Forwards() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 15));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty());
    assertNull(moveResponse.getPawn1());
    // THEN Gamestate is correct
    assertEquals(new PositionKey("0", 15), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("1", 0), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void PawnOnOtherStart_PawnCannotBePlacedThere_Backwards() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("1", 1));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty()); // moves the pawn to the correct tile
    assertNull(moveResponse.getPawn1()); // moves the correct pawn
    // THEN Gamestate is correct
    assertEquals(new PositionKey("1", 1), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("1", 0), gameState.getPawn(pawn2).getCurrentTileId());
  }
}
