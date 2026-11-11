package adg;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import adg.keezen.GameRegistry;
import adg.keezen.GameSession;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.yaml.snakeyaml.Yaml;

class GameLockFilterTest {

  private static final String GAME = "game-lock-filter-test";
  private static final String OTHER_GAME = "game-lock-filter-test-other";

  private final GameLockFilter filter = new GameLockFilter();

  @AfterEach
  void removeGames() {
    GameRegistry.removeGame(GAME);
    GameRegistry.removeGame(OTHER_GAME);
  }

  /** A request as it reaches the app on the Pi: under the /keezen context path. */
  private static HttpServletRequest request(String path) {
    HttpServletRequest request = mock(HttpServletRequest.class);
    when(request.getContextPath()).thenReturn("/keezen");
    when(request.getRequestURI()).thenReturn("/keezen" + path);
    return request;
  }

  /** Runs the request through the filter on its own thread, with {@code chain} as the handler. */
  private Thread send(HttpServletRequest request, FilterChain chain) {
    Thread thread = new Thread(() -> {
      try {
        filter.doFilterInternal(request, mock(HttpServletResponse.class), chain);
      } catch (Exception e) {
        throw new IllegalStateException(e);
      }
    });
    thread.start();
    return thread;
  }

  // A double click sends the same move twice. Run side by side, both passed the turn check and
  // both took the last card out of the hand, which broke it for good (size -1). The second request
  // for a game must not reach the handler until the first has left it.
  @Test
  void aSecondRequestForTheSameGame_waitsUntilTheFirstIsDone() throws Exception {
    GameRegistry.createNewGame(GAME);
    CountDownLatch firstInside = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch secondInside = new CountDownLatch(1);

    // GIVEN the first move is still being handled
    send(request("/moves/" + GAME + "/p1"), (req, resp) -> {
      firstInside.countDown();
      await(releaseFirst);
    });
    assertTrue(firstInside.await(1, TimeUnit.SECONDS), "first request reached the handler");

    // WHEN the same move arrives again
    send(request("/moves/" + GAME + "/p1"), (req, resp) -> secondInside.countDown());

    // THEN it waits for the first to finish, and only then runs
    assertFalse(secondInside.await(200, TimeUnit.MILLISECONDS), "second waits while first runs");
    releaseFirst.countDown();
    assertTrue(secondInside.await(1, TimeUnit.SECONDS), "second runs once first is done");
  }

  // The lock is per game: a slow move in one game must not hold up the players of another.
  @Test
  void requestsForDifferentGames_runSideBySide() throws Exception {
    GameRegistry.createNewGame(GAME);
    GameRegistry.createNewGame(OTHER_GAME);
    CountDownLatch firstInside = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch otherInside = new CountDownLatch(1);

    // GIVEN a move in one game is still being handled
    send(request("/moves/" + GAME + "/p1"), (req, resp) -> {
      firstInside.countDown();
      await(releaseFirst);
    });
    assertTrue(firstInside.await(1, TimeUnit.SECONDS), "first request reached the handler");

    // WHEN a request for another game arrives
    send(request("/cards/" + OTHER_GAME + "/p2"), (req, resp) -> otherInside.countDown());

    // THEN it runs straight away, without waiting for the first game
    assertTrue(otherInside.await(1, TimeUnit.SECONDS), "other game is not held up");
    releaseFirst.countDown();
  }

  // Creating a game, listing games, the options page, the app itself, and an id of a game that is
  // gone (the client then gets its 404 from the handler) — none of these name a running game, so
  // there is nothing to lock: they go straight to the handler, and a short path is no error.
  @Test
  void aRequestWithoutAKnownGame_passesStraightThrough() throws Exception {
    for (String path : List.of("/", "/games", "/game-options", "/moves/no-such-game/p1")) {
      AtomicBoolean handled = new AtomicBoolean();

      filter.doFilterInternal(
          request(path), mock(HttpServletResponse.class), (req, resp) -> handled.set(true));

      assertTrue(handled.get(), path + " reached the handler");
    }
  }

  // A move that crashes must not take the game down with it: had the lock stayed held, every later
  // request for that game would hang, and the game would freeze for everyone.
  @Test
  void theGameIsFreedAgain_whenARequestFails() throws Exception {
    GameRegistry.createNewGame(GAME);
    CountDownLatch nextInside = new CountDownLatch(1);

    // GIVEN a request whose handler throws
    assertThrows(IllegalStateException.class, () -> filter.doFilterInternal(
        request("/moves/" + GAME + "/p1"), mock(HttpServletResponse.class), (req, resp) -> {
          throw new IllegalStateException("move failed");
        }));

    // WHEN the next request for that game arrives, from another player's thread
    send(request("/cards/" + GAME + "/p2"), (req, resp) -> nextInside.countDown());

    // THEN it gets through
    assertTrue(nextInside.await(1, TimeUnit.SECONDS), "game is not left locked");
  }

  // Every request that names a game must hold that game's lock — endpoints added later included,
  // or a double-click on them runs side by side again. Each path in the API spec that names a game
  // is sent through the filter while the test holds the game's lock itself: a covered path waits
  // for it, while a path the filter misses would run straight through.
  @ParameterizedTest
  @MethodSource("specPathsNamingAGame")
  void everyEndpointNamingAGame_waitsForThatGamesLock(String specPath) throws Exception {
    GameRegistry.createNewGame(GAME);
    GameSession game = GameRegistry.getGameOrThrow(GAME);
    String path = specPath.replace("{sessionId}", GAME).replaceAll("\\{[^}]+}", "p1");
    CountDownLatch inside = new CountDownLatch(1);

    // GIVEN the game is busy: something holds its lock
    synchronized (game) {
      // WHEN a request to this endpoint arrives
      send(request(path), (req, resp) -> inside.countDown());

      // THEN it waits for the game
      assertFalse(inside.await(200, TimeUnit.MILLISECONDS), path + " waits while the game is busy");
    }
    // …and runs once the game is free
    assertTrue(inside.await(1, TimeUnit.SECONDS), path + " runs once the game is free");
  }

  /** Every path in the API spec that names a game by its {sessionId}. */
  @SuppressWarnings("unchecked")
  static Stream<String> specPathsNamingAGame() throws IOException {
    Map<String, Object> spec;
    try (Reader reader = Files.newBufferedReader(Path.of("../keezenspel_openapi.yml"))) {
      spec = new Yaml().load(reader);
    }
    Map<String, Object> paths = (Map<String, Object>) spec.get("paths");
    return paths.keySet().stream().filter(path -> path.contains("{sessionId}"));
  }

  private static void await(CountDownLatch latch) {
    try {
      latch.await(5, TimeUnit.SECONDS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
