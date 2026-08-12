package adg.keezen.logic;

import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.PositionKey;
import java.util.LinkedList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * this class was originally created to extrapolate and create a list of all tiles between the
 * starting point of a pawn and where it ends. This was used to highlight every tile in between but
 * I decided against using that. But it is still a useful test to test where a pawn should change
 * course. Some of these tests may therefore be duplicates.
 */
class MissingTilesTest {

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    GameState gameState = engine.getGameState();

    gameState.stop();
    gameState.addPlayer(new Player("player0", "0"));
    gameState.addPlayer(new Player("player1", "1"));
    gameState.addPlayer(new Player("player2", "2"));
    gameState.start(false);
  }

  @AfterEach
  void tearDown() {}

  @Test
  void test_tileNrs0and2_addInBetween() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("0", 0));
    tiles.add(new PositionKey("0", 2));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("0", 0));
    expectedTiles.add(new PositionKey("0", 2));

    assertEquals(expectedTiles, tiles);
  }

  @Test
  void test_tileNrs2and0_addInBetween() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("0", 2));
    tiles.add(new PositionKey("0", 0));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("0", 2));
    expectedTiles.add(new PositionKey("0", 0));

    assertEquals(expectedTiles, tiles);
  }

  // next segment
  @Test
  void test_tileNrs14and1_addInBetween() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("0", 14));
    tiles.add(new PositionKey("1", 1));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("0", 14));
    expectedTiles.add(new PositionKey("1", 1));

    assertEquals(expectedTiles, tiles);
  }

  @Test
  void test_tileNrs1and14_addInBetweenBackwards() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("1", 1));
    tiles.add(new PositionKey("0", 14));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("1", 1));
    expectedTiles.add(new PositionKey("0", 14));

    assertEquals(expectedTiles, tiles);
  }

  // pingpong normal tiles
  @Test
  void test_pingpong_normaltiles() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("0", 0));
    tiles.add(new PositionKey("0", 5));
    tiles.add(new PositionKey("0", 0));
    tiles.add(new PositionKey("0", 2));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("0", 0));
    expectedTiles.add(new PositionKey("0", 5));
    expectedTiles.add(new PositionKey("0", 0));
    expectedTiles.add(new PositionKey("0", 2));

    assertEquals(expectedTiles, tiles);
  }

  // pingpong over start
  @Test
  void test_pingpong_starttiles() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("2", 14));
    tiles.add(new PositionKey("0", 1));
    tiles.add(new PositionKey("2", 14));
    tiles.add(new PositionKey("0", 1));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("2", 14));
    expectedTiles.add(new PositionKey("0", 1));
    expectedTiles.add(new PositionKey("2", 14));
    expectedTiles.add(new PositionKey("0", 1));

    assertEquals(expectedTiles, tiles);
  }

  // pingpong in finish
  @Test
  void test_pingpong_onFinishTiles() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("2", 16));
    tiles.add(new PositionKey("2", 19));
    tiles.add(new PositionKey("2", 16));
    tiles.add(new PositionKey("2", 19));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("2", 16));
    expectedTiles.add(new PositionKey("2", 19));
    expectedTiles.add(new PositionKey("2", 16));
    expectedTiles.add(new PositionKey("2", 19));

    assertEquals(expectedTiles, tiles);
  }

  // pingpong out of finish
  @Test
  void test_pingpong_outOfFinishTiles_startingOnFinish() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("2", 18));
    tiles.add(new PositionKey("1", 14));
    tiles.add(new PositionKey("2", 18));
    tiles.add(new PositionKey("1", 14));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("2", 18));
    expectedTiles.add(new PositionKey("1", 14));
    expectedTiles.add(new PositionKey("2", 18));
    expectedTiles.add(new PositionKey("1", 14));

    assertEquals(expectedTiles, tiles);
  }

  @Test
  void test_pingpong_outOfFinishTiles_startingOutsideFinish() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("1", 14));
    tiles.add(new PositionKey("2", 18));
    tiles.add(new PositionKey("1", 14));
    tiles.add(new PositionKey("2", 18));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("1", 14));
    expectedTiles.add(new PositionKey("2", 18));
    expectedTiles.add(new PositionKey("1", 14));
    expectedTiles.add(new PositionKey("2", 18));

    assertEquals(expectedTiles, tiles);
  }

  @Test
  void test_onSameTile() {
    LinkedList<PositionKey> tiles = new LinkedList<>();
    tiles.add(new PositionKey("1", 5));

    LinkedList<PositionKey> expectedTiles = new LinkedList<>();
    expectedTiles.add(new PositionKey("1", 5));

    assertEquals(expectedTiles, tiles);
  }
}
