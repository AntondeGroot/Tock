package adg.services;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Player;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class SseEmitterServiceTest {

  /** A started two-player game, with the exact-move option set as given. */
  private static GameSession startedGame(boolean exactMoveRequired) {
    GameSession session = new GameSession();
    GameState gs = session.getGameState();
    gs.setExactMoveRequired(exactMoveRequired);
    gs.addPlayer(new Player("0", "0"));
    gs.addPlayer(new Player("1", "1"));
    gs.start(false);
    return session;
  }

  /**
   * The game rules in the client explain what happens at a blocked start tile or the end of the
   * finish, and that answer flips with the exact-move option: a pawn turns around, or the move is
   * refused. The push is the only way the client learns which game it is in, so it must carry the
   * option — every player's push, not only the one whose turn it is.
   */
  @Test
  void buildPush_tellsEveryPlayerWhetherExactMovesAreRequired() {
    SseEmitterService service = new SseEmitterService();

    GameSession exact = startedGame(true);
    assertTrue(service.buildPush(exact, "0", false).isExactMoveRequired(), "player on turn");
    assertTrue(service.buildPush(exact, "1", false).isExactMoveRequired(), "player waiting");

    GameSession bouncing = startedGame(false);
    assertFalse(service.buildPush(bouncing, "0", false).isExactMoveRequired());
  }

  /**
   * push() is called inside the move HTTP request (MovesApiDelegateImpl pushes the new game state
   * after applying the move). If building a player's snapshot throws — e.g. an NPE deep in
   * MoveAvailabilityChecker via buildPush — that exception must NOT propagate, otherwise an
   * already-applied move turns into an HTTP 500 and the player is kicked back to the lobby.
   */
  @Test
  void push_swallowsSnapshotBuildFailure_soTheMoveRequestIsNotFailed() {
    SseEmitterService service = new SseEmitterService() {
      @Override
      public GameStatePush buildPush(GameSession session, String playerId, boolean omitLastMove) {
        throw new RuntimeException("simulated snapshot-building failure");
      }
    };
    GameSession session = new GameSession();
    // register a live emitter so push() iterates the session and actually calls buildPush
    service.subscribe("sess", "p1");

    assertDoesNotThrow(() -> service.push("sess", session));
  }

  /**
   * The core of the slow-connection fix: a client whose network write blocks must NOT block
   * push(), which runs on the move's request thread. If it did, a slow player would make the
   * move request hang (looking like a failed card play) and could exhaust the request-thread pool.
   */
  @Test
  void push_doesNotBlockCaller_whenAClientSendBlocks() throws Exception {
    CountDownLatch sendStarted = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);

    SseEmitter blocking = new SseEmitter(Long.MAX_VALUE) {
      @Override
      public void send(SseEventBuilder builder) throws IOException {
        sendStarted.countDown();
        try {
          release.await(); // simulate a stalled/slow socket write
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
        }
      }
    };
    SseEmitterService service = new SseEmitterService() {
      @Override
      protected SseEmitter newEmitter() {
        return blocking;
      }

      @Override
      public GameStatePush buildPush(GameSession s, String playerId, boolean omitLastMove) {
        return new GameStatePush();
      }
    };
    service.subscribe("sess", "p1");

    long startNanos = System.nanoTime();
    service.push("sess", new GameSession());
    long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000;

    try {
      assertTrue(sendStarted.await(2, TimeUnit.SECONDS),
          "send should run on the per-emitter sender thread");
      assertTrue(elapsedMs < 500,
          "push() must return promptly even while a client's send() is blocked (was " + elapsedMs + "ms)");
    } finally {
      release.countDown();
    }
  }
}