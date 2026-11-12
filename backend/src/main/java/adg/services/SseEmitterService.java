package adg.services;

import adg.keezen.GameSession;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class SseEmitterService {

  private static final Logger log = LoggerFactory.getLogger(SseEmitterService.class);

  /** The event that tells a board its game is gone, so it stops listening for good. */
  private static final String GAME_ENDED_EVENT = "gameended";

  /**
   * Bound on how many state snapshots may queue for one slow client before the oldest are
   * dropped. Each snapshot is a full game state, so a slow client only needs the most recent
   * one — dropping stale snapshots (DiscardOldestPolicy) keeps memory bounded while still
   * delivering the latest state once the connection drains.
   */
  private static final int SEND_QUEUE_CAPACITY = 16;

  /** Each emitter gets its own single-thread sender so a slow client only delays its own stream. */
  private record PlayerEmitter(String playerId, SseEmitter emitter, ExecutorService sender) {}

  private final Map<String, CopyOnWriteArrayList<PlayerEmitter>> emittersBySession =
      new ConcurrentHashMap<>();

  /** Overridable so tests can inject an emitter whose send() blocks. */
  protected SseEmitter newEmitter() {
    return new SseEmitter(Long.MAX_VALUE);
  }

  public SseEmitter subscribe(String sessionId, String playerId) {
    SseEmitter emitter = newEmitter();
    CopyOnWriteArrayList<PlayerEmitter> list =
        emittersBySession.computeIfAbsent(sessionId, k -> new CopyOnWriteArrayList<>());
    PlayerEmitter pe = new PlayerEmitter(playerId, emitter, newSenderExecutor(playerId));
    list.add(pe);
    Runnable cleanup = () -> {
      list.remove(pe);
      pe.sender().shutdownNow();
    };
    emitter.onCompletion(cleanup);
    emitter.onTimeout(cleanup);
    emitter.onError(e -> cleanup.run());
    return emitter;
  }

  /**
   * Ends every stream of a game that is gone. Nothing is sent on them again, so a client that left
   * would never be noticed, and each stream would keep its sender thread for good.
   */
  public void closeStreams(String sessionId) {
    CopyOnWriteArrayList<PlayerEmitter> list = emittersBySession.remove(sessionId);
    if (list == null) return;
    list.forEach(pe -> endAsync(list, pe));
  }

  /**
   * A stream for a game that does not exist (any more): it only says so, and ends. It is never
   * registered, as nothing will ever be pushed to it.
   */
  public static SseEmitter gameEndedStream() {
    SseEmitter emitter = new SseEmitter();
    try {
      emitter.send(gameEndedEvent());
      emitter.complete();
    } catch (IOException e) {
      emitter.completeWithError(e);
    }
    return emitter;
  }

  /**
   * Tells the board its game has ended, so it stops instead of reconnecting: a stream that just
   * ends looks like a dropped connection to the browser. The data is there because the browser's
   * EventSource drops an event without any.
   */
  private static SseEmitter.SseEventBuilder gameEndedEvent() {
    return SseEmitter.event().name(GAME_ENDED_EVENT).data("ended");
  }

  /**
   * Writes an SSE comment on every open stream. A client that went away without closing its stream
   * (a phone that lost its connection) is only noticed when a write to it fails, and in a game
   * where nobody moves nothing else is written. The browser's EventSource ignores comments.
   */
  public void sendHeartbeats() {
    emittersBySession.values().forEach(list ->
        list.forEach(pe -> sendAsync(list, pe, SseEmitter.event().comment("heartbeat"))));
  }

  private static ExecutorService newSenderExecutor(String playerId) {
    return new ThreadPoolExecutor(
        1, 1, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(SEND_QUEUE_CAPACITY),
        r -> {
          Thread t = new Thread(r, "sse-sender-" + playerId);
          t.setDaemon(true);
          return t;
        },
        new ThreadPoolExecutor.DiscardOldestPolicy());
  }

  public void push(String sessionId, GameSession session) {
    CopyOnWriteArrayList<PlayerEmitter> list = emittersBySession.get(sessionId);
    if (list == null || list.isEmpty()) return;
    for (PlayerEmitter pe : list) {
      GameStatePush snapshot;
      try {
        // Build the snapshot on the caller's (request) thread, where the game state is stable
        // and not being mutated by a concurrent move. Only the blocking network write is handed
        // off asynchronously below.
        snapshot = buildPush(session, pe.playerId(), false);
      } catch (RuntimeException e) {
        // A snapshot-building failure (e.g. an NPE deep in MoveAvailabilityChecker) must never
        // propagate: push() is called inside the move request, so an exception here would turn an
        // already-applied move into an HTTP 500 and kick the player back to the lobby. Log and
        // skip this player; the next push will retry.
        log.error("Failed to build game-state push for player {} in session {}",
            pe.playerId(), sessionId, e);
        continue;
      }
      sendAsync(list, pe,
          SseEmitter.event().name("gamestate").data(snapshot, MediaType.APPLICATION_JSON));
    }
  }

  /**
   * Hands the blocking SSE write to the emitter's own single-thread sender. This keeps a slow or
   * stalled client from blocking the move request (which would time out and look like a failed
   * move, and could exhaust the request-thread pool). Sends stay serialized and in order per
   * emitter; a client that falls too far behind has its stale snapshots dropped, and a broken
   * connection causes the emitter to be removed.
   */
  private void sendAsync(
      CopyOnWriteArrayList<PlayerEmitter> list, PlayerEmitter pe, SseEmitter.SseEventBuilder event) {
    try {
      pe.sender().execute(() -> {
        try {
          pe.emitter().send(event);
        } catch (Exception e) {
          drop(list, pe);
        }
      });
    } catch (RejectedExecutionException e) {
      // Sender already shut down (emitter is being cleaned up) — nothing to send.
    }
  }

  /**
   * Sends the game-ended event and then closes the stream, both on its sender, so the event goes
   * out after any game states still queued, and isn't lost to the close.
   */
  private void endAsync(CopyOnWriteArrayList<PlayerEmitter> list, PlayerEmitter pe) {
    try {
      pe.sender().execute(() -> {
        try {
          pe.emitter().send(gameEndedEvent());
        } catch (Exception e) {
          // The client is gone already; the stream is closed below all the same.
        } finally {
          drop(list, pe);
        }
      });
    } catch (RejectedExecutionException e) {
      drop(list, pe); // sender already shut down: just close the stream
    }
  }

  /**
   * Stops every sender when the app is undeployed: inside the shared Tomcat the JVM outlives the
   * app, so a lingering sender thread would keep the old version's classes in memory.
   */
  @PreDestroy
  void shutdown() {
    emittersBySession.values().forEach(list -> list.forEach(pe -> pe.sender().shutdownNow()));
    emittersBySession.clear();
  }

  private void drop(CopyOnWriteArrayList<PlayerEmitter> list, PlayerEmitter pe) {
    list.remove(pe);
    pe.sender().shutdownNow();
    try {
      pe.emitter().complete();
    } catch (RuntimeException ignored) {
      // emitter may already be completed/errored
    }
  }

  /** The game state as this player sees it. push() builds through here, so tests can stub it. */
  public GameStatePush buildPush(GameSession session, String playerId, boolean omitLastMove) {
    return GameStatePushes.forPlayer(session, playerId, omitLastMove);
  }
}