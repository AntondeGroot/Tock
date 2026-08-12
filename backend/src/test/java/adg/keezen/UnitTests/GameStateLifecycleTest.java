package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.createGame_With_NPlayers;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.MoveType;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Lifecycle bookkeeping: clearResponse, the must-play timeout, and reset. */
class GameStateLifecycleTest {

  private GameState gameState;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    createGame_With_NPlayers(gameState, 4);
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
  }

  @Test
  void clearResponseNullsEveryField() {
    MoveResponse r = new MoveResponse();
    r.setPawn1(new Pawn("0", new PawnId("0", 0), new PositionKey("0", 1), new PositionKey("0", -1)));
    r.setPawn2(new Pawn("0", new PawnId("0", 1), new PositionKey("0", 2), new PositionKey("0", -2)));
    r.setMoveType(MoveType.MOVE);
    r.setMovePawn1(List.of(new PositionKey("0", 1)));
    r.setMovePawn2(List.of(new PositionKey("0", 2)));

    gameState.clearResponse(r);

    assertNull(r.getPawn1());
    assertNull(r.getPawn2());
    assertNull(r.getMoveType());
    assertNull(r.getMovePawn1());
    assertNull(r.getMovePawn2());
  }

  @Test
  void mustPlayTimeoutIsNotElapsedWhenNotBlocked() {
    gameState.clearMustPlayBlocked();
    assertFalse(gameState.mustPlayTimeoutElapsed());
  }

  @Test
  void mustPlayTimeoutElapsesWhenBlockedLongAgo() {
    gameState.setMustPlayBlockedSince(1L); // effectively 1970 — well past the timeout
    assertTrue(gameState.mustPlayTimeoutElapsed());
  }

  @Test
  void mustPlayTimeoutIsNotElapsedRightAfterBlocking() {
    gameState.setMustPlayBlockedSince(System.currentTimeMillis());
    assertFalse(gameState.mustPlayTimeoutElapsed());
  }

  @Test
  void startAndReset_putTheFirstSeatOnTurnAsTheSolePlayerToMove() {
    // setUp already started the game — verify start() left the first seat on turn and playing.
    assertFirstSeatIsSolePlayerToMove();

    gameState.reset();
    assertFirstSeatIsSolePlayerToMove();
  }

  private void assertFirstSeatIsSolePlayerToMove() {
    String first = gameState.getPlayers().getFirst().getId();
    assertEquals(first, gameState.getPlayerIdTurn(), "first seat holds the turn");
    assertTrue(Boolean.TRUE.equals(gameState.getPlayers().getFirst().getIsPlaying()),
        "first seat is the player to move");
    assertTrue(gameState.getPlayers().stream().skip(1)
            .noneMatch(p -> Boolean.TRUE.equals(p.getIsPlaying())),
        "no other seat is marked as playing");
  }

  @Test
  void advancingTheTurn_marksTheNewCurrentPlayerAsTheSolePlayerToMove() {
    // setUp started a 4-player game; player on turn forfeits, handing the turn to the next player.
    String first = gameState.getPlayerIdTurn();
    gameState.processOnForfeit(first);

    String next = gameState.getPlayerIdTurn();
    assertNotEquals(first, next, "the turn moved on");
    assertTrue(isPlaying(next), "the new current player is marked as playing");
    assertFalse(isPlaying(first), "the player who just forfeited is no longer playing");
  }

  private boolean isPlaying(String playerId) {
    Boolean playing = gameState.getPlayers().stream()
        .filter(p -> p.getId().equals(playerId))
        .findFirst()
        .orElseThrow()
        .getIsPlaying();
    return playing != null && playing;
  }

  @Test
  void resetReturnsPawnsToTheirNestAndBumpsTheVersion() {
    gameState.start();
    Pawn onBoard = gameState.getPawns().getFirst();
    PawnId id = onBoard.getPawnId();
    PositionKey nest = onBoard.getNestTileId();

    // move the pawn off its nest, then reset
    gameState.movePawn(new Pawn(onBoard.getPlayerId(), id, new PositionKey(onBoard.getPlayerId(), 5), nest));
    assertNotEquals(nest, gameState.getPawn(id).getCurrentTileId());
    long versionBefore = gameState.getVersion();

    gameState.reset();

    assertEquals(nest, gameState.getPawn(id).getCurrentTileId()); // resetPawnPositions ran
    assertTrue(gameState.getVersion() > versionBefore); // version bumped
    assertFalse(gameState.getActivePlayers().isEmpty()); // active players rebuilt
  }
}
