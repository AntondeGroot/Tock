package adg.services;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import adg.keezen.GameSession;
import java.io.IOException;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class SseEmitterServiceTest {

  /**
   * A stream's sender thread starts on its first push and only ends when the stream is cleaned up.
   * Once a game is gone nothing is sent on its streams again, so a client's disconnect is never
   * noticed: closing the game's streams is the only thing that can end that thread.
   */
  @Test
  void closeStreams_endsTheSenderThreadOfTheGamesStream() throws Exception {
    SseEmitterService service = new SseEmitterService() {
      @Override
      public GameStatePush buildPush(GameSession s, String playerId, boolean omitLastMove) {
        return new GameStatePush();
      }
    };
    String playerId = "p-" + UUID.randomUUID(); // unique, so its thread can't be mistaken
    service.subscribe("sess", playerId);
    service.push("sess", new GameSession()); // starts the stream's sender thread
    Thread sender = senderThreadOf(playerId);

    service.closeStreams("sess");

    sender.join(2_000);
    assertFalse(sender.isAlive(), "the sender thread should end once its game's streams close");
  }

  /**
   * A client that disconnects from an idle stream is only noticed when something is written to it,
   * and nothing else is written to a stream that is waiting for the next move. The heartbeat is an
   * SSE comment (a line starting with ':'), which the browser's EventSource ignores, so the board
   * never mistakes it for a game state.
   */
  @Test
  void sendHeartbeats_writesACommentOnAnIdleStream() throws Exception {
    CompletableFuture<String> firstWrite = new CompletableFuture<>();
    SseEmitter recording = new SseEmitter(Long.MAX_VALUE) {
      @Override
      public void send(SseEventBuilder builder) {
        firstWrite.complete(textOf(builder));
      }
    };
    SseEmitterService service = new SseEmitterService() {
      @Override
      protected SseEmitter newEmitter() {
        return recording;
      }
    };
    service.subscribe("sess", "p1"); // idle: no push ever

    service.sendHeartbeats();

    String written = assertDoesNotThrow(
        () -> firstWrite.get(2, TimeUnit.SECONDS), "an idle stream should get a heartbeat");
    assertTrue(written.startsWith(":"), "the heartbeat should be an SSE comment, was: " + written);
  }

  /**
   * The point of the heartbeat: a client that has gone away without closing its stream (a phone
   * that lost its connection) makes the heartbeat's write fail, and that failure must clean the
   * stream up, ending its sender thread like any other failed write does.
   */
  @Test
  void sendHeartbeats_endsTheSenderThread_ofAClientThatIsGone() throws Exception {
    CompletableFuture<Thread> writingThread = new CompletableFuture<>();
    SseEmitter gone = new SseEmitter(Long.MAX_VALUE) {
      @Override
      public void send(SseEventBuilder builder) throws IOException {
        writingThread.complete(Thread.currentThread());
        throw new IOException("Broken pipe"); // what writing to a vanished client gives
      }
    };
    SseEmitterService service = new SseEmitterService() {
      @Override
      protected SseEmitter newEmitter() {
        return gone;
      }
    };
    service.subscribe("sess", "p1");

    service.sendHeartbeats();

    Thread sender = assertDoesNotThrow(
        () -> writingThread.get(2, TimeUnit.SECONDS), "the heartbeat should try to write");
    sender.join(2_000);
    assertFalse(sender.isAlive(), "the sender thread should end once the heartbeat's write fails");
  }

  /**
   * A player whose phone died comes back through the lobby and opens a new stream, while the old
   * one is still registered: nobody has noticed yet that it is dead. Writing to a dead phone can
   * hang rather than fail, so the old stream here blocks forever. The new stream must get the next
   * game state all the same, or the returning player would look at a frozen board.
   */
  @Test
  void push_reachesARejoiningPlayersNewStream_whileTheirOldStreamHangs() throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    SseEmitter deadPhone = new SseEmitter(Long.MAX_VALUE) {
      @Override
      public void send(SseEventBuilder builder) {
        try {
          release.await(); // a write that never completes
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
        }
      }
    };
    CompletableFuture<String> newPhoneReceived = new CompletableFuture<>();
    SseEmitter newPhone = new SseEmitter(Long.MAX_VALUE) {
      @Override
      public void send(SseEventBuilder builder) {
        newPhoneReceived.complete(textOf(builder));
      }
    };
    Iterator<SseEmitter> phones = List.of(deadPhone, newPhone).iterator();
    SseEmitterService service = new SseEmitterService() {
      @Override
      protected SseEmitter newEmitter() {
        return phones.next();
      }

      @Override
      public GameStatePush buildPush(GameSession s, String playerId, boolean omitLastMove) {
        return new GameStatePush();
      }
    };
    service.subscribe("sess", "p1"); // before the battery died
    service.subscribe("sess", "p1"); // back through the lobby

    // Off the test thread: if a hanging stream ever blocked push(), this test should fail, not hang.
    CompletableFuture.runAsync(() -> service.push("sess", new GameSession()));

    try {
      String received = assertDoesNotThrow(
          () -> newPhoneReceived.get(2, TimeUnit.SECONDS),
          "the new stream should get the game state while the old one hangs");
      assertTrue(received.contains("event:gamestate"), "should be a game state, was: " + received);
    } finally {
      release.countDown();
    }
  }

  /** The text an event puts on the wire. */
  private static String textOf(SseEmitter.SseEventBuilder builder) {
    return builder.build().stream()
        .map(part -> String.valueOf(part.getData()))
        .collect(Collectors.joining());
  }

  private static Thread senderThreadOf(String playerId) {
    return Thread.getAllStackTraces().keySet().stream()
        .filter(t -> t.getName().equals("sse-sender-" + playerId))
        .findFirst()
        .orElseThrow(() -> new AssertionError("no sender thread for " + playerId));
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