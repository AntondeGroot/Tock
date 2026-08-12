package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static org.junit.Assert.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

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
import com.adg.openapi.model.TempMessageType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MovingOnSwitchTest {

  private MoveRequest moveMessage = new MoveRequest();
  private MoveResponse moveResponse = new MoveResponse();

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();

    createGame_With_NPlayers(gameState, 3);
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
  void playerPlaysJack_ThenNextPlayerPlays() {
    // GIVEN
    Card card = givePlayerJack(cardsDeck, 0);
    String playerId = "0";
    PositionKey tileId1 = new PositionKey(playerId, 5);
    PositionKey tileId2 = new PositionKey("1", 3);
    Pawn pawn1 = placePawnOnNest(gameState, playerId, tileId1);
    Pawn pawn2 = placePawnOnNest(gameState, "1", tileId2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card);
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN: response message is correct
    assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void playerPlaysJackAsLastCard_ThenNextPlayerPlays() {
    // GIVEN
    String playerId = "0";
    PositionKey tileId1 = new PositionKey(playerId, 5);
    PositionKey tileId2 = new PositionKey("1", 3);
    Pawn pawn1 = placePawnOnNest(gameState, playerId, tileId1);
    Pawn pawn2 = placePawnOnNest(gameState, "1", tileId2);

    for (int i = 0; i < 4; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "0");
      sendValidMoveRequest(gameState, cardsDeck, "1");
      sendValidMoveRequest(gameState, cardsDeck, "2");
    }

    Card card = givePlayerJack(cardsDeck, 0);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card);
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN
    assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void switchPawnsOnNormalTiles_SelectedOwnPawnFirst() {
    // GIVEN
    Card card = givePlayerJack(cardsDeck, 0);
    String playerId = "0";
    PositionKey tileId1 = new PositionKey(playerId, 5);
    PositionKey tileId2 = new PositionKey("1", 3);
    Pawn pawn1 = placePawnOnNest(gameState, playerId, tileId1);
    Pawn pawn2 = placePawnOnNest(gameState, "1", tileId2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card);
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN: response message is correct
    assertEquals(tileId2, moveResponse.getMovePawn1().getLast());
    assertEquals(tileId1, moveResponse.getMovePawn2().getLast());
    // THEN: GameState is correct
    assertEquals(tileId2, gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(tileId1, gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void switchPawnsOnNormalTiles_SelectedOtherPawnFirst() {
    // GIVEN
    String playerId = "0";
    Card card = givePlayerJack(cardsDeck, 0);
    PositionKey tileId1 = new PositionKey(playerId, 5);
    PositionKey tileId2 = new PositionKey("1", 3);
    Pawn pawn1 = placePawnOnNest(gameState, playerId, tileId1);
    Pawn pawn2 = placePawnOnNest(gameState, "1", tileId2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card);
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN: response message is correct
    assertEquals(tileId2, moveResponse.getMovePawn1().getLast());
    assertEquals(tileId1, moveResponse.getMovePawn2().getLast());
    // THEN: GameState is correct
    assertEquals(tileId2, gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(tileId1, gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void doNotSwitchPawnsBelongingToOthers() {
    // GIVEN
    String playerId = "0";
    Card card = givePlayerJack(cardsDeck, 0);
    Card card2 = givePlayerJack(cardsDeck, 2);
    PositionKey tileId1 = new PositionKey(playerId, 5);
    PositionKey tileId2 = new PositionKey("1", 3);
    Pawn pawn1 = placePawnOnNest(gameState, playerId, tileId1);
    Pawn pawn2 = placePawnOnNest(gameState, "1", tileId2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card);
    moveMessage.setPlayerId("2"); // request is made from unrelated player
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN: response message is correct
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty());
    assertTrue(moveResponse.getMovePawn2().isEmpty());
    // THEN: GameState is correct
    assertEquals(tileId1, gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(tileId2, gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void cantSwitchPawnFromNest() {
    // GIVEN
    String playerId = "0";
    Card card = givePlayerJack(cardsDeck, 0);
    PositionKey tileId1 = new PositionKey(playerId, -1);
    PositionKey tileId2 = new PositionKey("1", 3);
    Pawn pawn1 = placePawnOnNest(gameState, playerId, tileId1);
    Pawn pawn2 = placePawnOnNest(gameState, "1", tileId2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card); // request is made from unrelated player
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN: response message is correct
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty());
    assertTrue(moveResponse.getMovePawn2().isEmpty());
    // THEN: GameState is correct
    assertEquals(tileId1, gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(tileId2, gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void cantSwitchPawnFromFinish() {
    // GIVEN
    String playerId = "0";
    Card card = givePlayerJack(cardsDeck, 0);
    PositionKey tileId1 = new PositionKey(playerId, 16);
    PositionKey tileId2 = new PositionKey("1", 3);
    Pawn pawn1 = placePawnOnNest(gameState, playerId, tileId1);
    Pawn pawn2 = placePawnOnNest(gameState, "1", tileId2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card); // request is made from unrelated player
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN: response message is correct
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty());
    assertTrue(moveResponse.getMovePawn2().isEmpty());
    // THEN: GameState is correct
    assertEquals(tileId1, gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(tileId2, gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void cantTakeOtherPawnFromStart() {
    // GIVEN
    String playerId = "0";
    Card card = givePlayerJack(cardsDeck, 0);
    PositionKey tileId1 = new PositionKey(playerId, 4);
    PositionKey tileId2 = new PositionKey("1", 0);
    Pawn pawn1 = placePawnOnNest(gameState, playerId, tileId1);
    Pawn pawn2 = placePawnOnNest(gameState, "1", tileId2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card); // request is made from unrelated player
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN: response message is correct
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty());
    assertTrue(moveResponse.getMovePawn2().isEmpty());
    // THEN: GameState is correct
    assertEquals(tileId1, gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(tileId2, gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void canSwitchPawnFromOwnStart() {
    // GIVEN
    String playerId = "0";
    Card card = givePlayerJack(cardsDeck, 0);
    PositionKey tileId1 = new PositionKey(playerId, 0);
    PositionKey tileId2 = new PositionKey("1", 5);
    Pawn pawn1 = placePawnOnNest(gameState, playerId, tileId1);
    Pawn pawn2 = placePawnOnNest(gameState, "1", tileId2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card); // request is made from unrelated player
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN: response message is correct
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(tileId2, moveResponse.getMovePawn1().getLast());
    assertEquals(tileId1, moveResponse.getMovePawn2().getLast());
    // THEN: GameState is correct
    assertEquals(tileId2, gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(tileId1, gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void canSwitchOpponentPawnSittingOnAnotherPlayersStart() {
    // GIVEN green(0) has a pawn on the board, red(2) sits on blue's(1) start tile (1,0)
    String green = "0";
    Card card = givePlayerJack(cardsDeck, 0);
    PositionKey greenTile = new PositionKey(green, 5);
    PositionKey redOnBlueStart = new PositionKey("1", 0);
    Pawn greenPawn = placePawnOnBoard(gameState, new PawnId(green, 0), greenTile);
    Pawn redPawn = placePawnOnBoard(gameState, new PawnId("2", 0), redOnBlueStart);

    // WHEN green plays a Jack to switch with the red pawn (not on its OWN start)
    createSwitchMessage(moveMessage, greenPawn, redPawn, card);
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN the switch is allowed
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
  }

  @Test
  void cantSwitchWithOwnPawn() {
    // GIVEN
    String playerId = "0";
    Card card = givePlayerJack(cardsDeck, Integer.valueOf(playerId));
    PositionKey tileId1 = new PositionKey(playerId, 4);
    PositionKey tileId2 = new PositionKey(playerId, 2);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId(playerId, 0), tileId1);
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId(playerId, 1), tileId2);

    // WHEN
    createSwitchMessage(moveMessage, pawn1, pawn2, card); // request is made from unrelated player
    gameState.processOnSwitch(moveMessage, moveResponse);

    // THEN: response message is correct
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertTrue(moveResponse.getMovePawn1().isEmpty());
    assertTrue(moveResponse.getMovePawn2().isEmpty());
    // THEN: GameState is correct
    assertEquals(tileId1, gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(tileId2, gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void testWhenPawnsSwitch_CardGetsRemovedFromHand_AndNextPlayerPlays() {
    Card card = givePlayerJack(cardsDeck, 0);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 12));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("0", 5));
    assertEquals(5, cardsDeck.getCardsForPlayer("0").size());

    createSwitchMessage(moveMessage, pawn1, pawn2, card);
    gameState.processOnSwitch(moveMessage, moveResponse);

    assertEquals(4, cardsDeck.getCardsForPlayer("0").size());
    assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void testingWhenPawnsSwitch_CardNotRemovedFromHand() {
    Card card = givePlayerJack(cardsDeck, 0);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 12));
    Pawn pawn2 = placePawnOnNest(gameState, "1", new PositionKey("0", 5));
    assertEquals(5, cardsDeck.getCardsForPlayer("0").size());

    createSwitchMessage(moveMessage, pawn1, pawn2, card);
    moveMessage.setTempMessageType(TempMessageType.CHECK_MOVE);
    gameState.processOnSwitch(moveMessage, moveResponse);

    assertEquals(5, cardsDeck.getCardsForPlayer("0").size());
    assertEquals("0", gameState.getPlayerIdTurn());
  }
}
