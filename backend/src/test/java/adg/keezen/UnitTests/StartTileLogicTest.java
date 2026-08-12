package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class StartTileLogicTest {

  PositionKey startTileId;

  private GameState gameState;

  @BeforeEach
  void setup() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();

    createGame_With_NPlayers(gameState, 3);
    startTileId = new PositionKey("0", 0);
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
  }

  @Test
  void player2_canPassPlayer2_OnStartTile0() {
    Pawn pawn1 =
        GameStateUtil.placePawnOnBoard(gameState, new PawnId("2", 1), new PositionKey("2", 12));
    Pawn pawn2 =
        GameStateUtil.placePawnOnBoard(gameState, new PawnId("2", 2), new PositionKey("0", 0));

    Assertions.assertTrue(gameState.canPassStartTile(pawn1, startTileId));
  }

  @Test
  void player2_canPassPlayer1_OnStartTile0() {
    Pawn pawn1 =
        GameStateUtil.placePawnOnBoard(gameState, new PawnId("2", 1), new PositionKey("2", 12));
    Pawn pawn2 =
        GameStateUtil.placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("0", 0));

    assertTrue(gameState.canPassStartTile(pawn1, startTileId));
  }

  @Test
  void player2_cannotPassPlayer0_OnStartTile0() {
    Pawn pawn1 =
        GameStateUtil.placePawnOnBoard(gameState, new PawnId("2", 1), new PositionKey("2", 12));
    Pawn pawn2 =
        GameStateUtil.placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 0));

    assertFalse(gameState.canPassStartTile(pawn1, startTileId));
  }

  @Test
  void player2_canPassEmptyStartTile0() {
    Pawn pawn1 =
        GameStateUtil.placePawnOnBoard(gameState, new PawnId("2", 1), new PositionKey("2", 12));

    assertTrue(gameState.canPassStartTile(pawn1, startTileId));
  }
}
