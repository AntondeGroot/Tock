package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.createGame_With_NPlayers;
import static adg.keezen.UnitTests.GameStateUtil.createMoveRequest;
import static adg.keezen.UnitTests.GameStateUtil.givePlayerCard;
import static adg.keezen.UnitTests.GameStateUtil.placePawnOnNest;
import static org.junit.jupiter.api.Assertions.assertEquals;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnMove;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PositionKey;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Section-corner waypoints (tiles 1/7/13): existing tests only <em>cross</em> a corner, so the
 * boundary conditions in addWaypointsWithinSection (a pawn starting or ending exactly on a corner)
 * were never pinned. These moves sit on those exact boundaries so no spurious corner waypoint is
 * inserted.
 */
class MoveWaypointBoundaryTest {

  private GameState gameState;
  private CardsDeckInterface cardsDeck;
  private MoveRequest moveMessage;
  private MoveResponse moveResponse;

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
  }

  private List<PositionKey> pathFor(int startTile, int cardValue) {
    Card card = givePlayerCard(cardsDeck, 0, cardValue);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", startTile));
    createMoveRequest(moveMessage, pawn1, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);
    return moveResponse.getMovePawn1();
  }

  private static PositionKey t(int tileNr) {
    return new PositionKey("0", tileNr);
  }

  @Test
  void startingExactlyOnCorner1InsertsNoWaypoint1() {
    assertEquals(List.of(t(1), t(6)), pathFor(1, 5)); // 1 -> 6
  }

  @Test
  void endingExactlyOnCorner7InsertsNoWaypoint7() {
    assertEquals(List.of(t(2), t(7)), pathFor(2, 5)); // 2 -> 7
  }

  @Test
  void startingExactlyOnCorner7InsertsNoWaypoint7() {
    assertEquals(List.of(t(7), t(12)), pathFor(7, 5)); // 7 -> 12
  }

  @Test
  void endingExactlyOnCorner13InsertsNoWaypoint13() {
    assertEquals(List.of(t(8), t(13)), pathFor(8, 5)); // 8 -> 13
  }

  @Test
  void startingExactlyOnCorner13InsertsNoWaypoint13() {
    assertEquals(List.of(t(13), t(15)), pathFor(13, 2)); // 13 -> 15
  }

  // ── Backward (negative card) crossings sit on the same corner boundaries ─────

  @Test
  void backwardStartingExactlyOnCorner13InsertsNoWaypoint13() {
    assertEquals(List.of(t(13), t(8)), pathFor(13, -5)); // 13 -> 8
  }

  @Test
  void backwardEndingExactlyOnCorner13InsertsNoWaypoint13() {
    assertEquals(List.of(t(15), t(13)), pathFor(15, -2)); // 15 -> 13
  }

  @Test
  void backwardStartingExactlyOnCorner7InsertsNoWaypoint7() {
    assertEquals(List.of(t(7), t(2)), pathFor(7, -5)); // 7 -> 2
  }

  @Test
  void backwardEndingExactlyOnCorner7InsertsNoWaypoint7() {
    assertEquals(List.of(t(12), t(7)), pathFor(12, -5)); // 12 -> 7
  }
}
