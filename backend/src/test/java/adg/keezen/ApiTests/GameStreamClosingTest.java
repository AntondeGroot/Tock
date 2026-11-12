package adg.keezen.ApiTests;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;

import adg.keezen.ApiUtils.ApiUtil;
import adg.keezen.utils.ApiCallsHelper;
import adg.keezen.utils.BaseUnitTest;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/**
 * A player's live game-state stream must end once its game is gone. A stream that stays open
 * keeps its sender thread on the server for good, because nothing is ever sent on it again.
 */
public class GameStreamClosingTest extends BaseUnitTest {

  private final ApiCallsHelper apiHelper = new ApiCallsHelper();

  @Test
  void stoppingAGame_endsItsPlayersStreams() throws Exception {
    // GIVEN a player whose stream has delivered its first game state
    String sessionId = ApiUtil.createStandardGame();
    String playerId = ApiUtil.getPlayerid(sessionId, 0);
    CountDownLatch firstStateReceived = new CountDownLatch(1);
    CompletableFuture<List<String>> streamEnded =
        readStreamUntilItEnds(sessionId, playerId, firstStateReceived);
    assertTrue(firstStateReceived.await(3, TimeUnit.SECONDS), "the stream should open");

    // WHEN the game is stopped
    apiHelper.stopGame(sessionId);

    // THEN the server ends the stream
    assertDoesNotThrow(
        () -> streamEnded.get(3, TimeUnit.SECONDS),
        "the stream should end once its game is stopped");
  }

  @Test
  void theLastPlayerLeaving_endsTheStreams() throws Exception {
    // GIVEN a player whose stream has delivered its first game state
    String sessionId = ApiUtil.createStandardGame();
    String playerId = ApiUtil.getPlayerid(sessionId, 0);
    CountDownLatch firstStateReceived = new CountDownLatch(1);
    CompletableFuture<List<String>> streamEnded =
        readStreamUntilItEnds(sessionId, playerId, firstStateReceived);
    assertTrue(firstStateReceived.await(3, TimeUnit.SECONDS), "the stream should open");

    // WHEN every player leaves, which removes the game
    for (int seat = 0; seat < 3; seat++) {
      ApiUtil.leaveGame(sessionId, ApiUtil.getPlayerid(sessionId, seat));
    }

    // THEN the server ends the stream
    assertDoesNotThrow(
        () -> streamEnded.get(3, TimeUnit.SECONDS),
        "the stream should end once the last player has left");
  }

  /**
   * A stream that just ends looks like a dropped connection, so the browser reconnects, and keeps
   * reconnecting to a game that is gone. The server first says why it is ending the stream, so the
   * board can stop for good.
   */
  @Test
  void stoppingAGame_tellsTheBoardTheGameHasEnded() throws Exception {
    // GIVEN a player whose stream has delivered its first game state
    String sessionId = ApiUtil.createStandardGame();
    String playerId = ApiUtil.getPlayerid(sessionId, 0);
    CountDownLatch firstStateReceived = new CountDownLatch(1);
    CompletableFuture<List<String>> streamEnded =
        readStreamUntilItEnds(sessionId, playerId, firstStateReceived);
    assertTrue(firstStateReceived.await(3, TimeUnit.SECONDS), "the stream should open");

    // WHEN the game is stopped
    apiHelper.stopGame(sessionId);

    // THEN the last event before the stream ends says the game has ended
    List<String> lines = assertDoesNotThrow(
        () -> streamEnded.get(3, TimeUnit.SECONDS),
        "the stream should end once its game is stopped");
    assertHasGameEndedEvent(lines);
  }

  /**
   * A board can ask for the stream of a game that is already gone: it was open in a tab when the
   * game ended, or its player follows an old link. An answer that just ends makes the browser try
   * again and again, so this one too must say the game has ended.
   */
  @Test
  void aStreamForAGameThatIsGone_tellsTheBoardTheGameHasEnded() {
    // WHEN a board asks for the stream of a game that does not exist
    CompletableFuture<List<String>> streamEnded =
        readStreamUntilItEnds("no-such-game", "player0", new CountDownLatch(1));

    // THEN the stream says the game has ended, and ends straight away
    List<String> lines = assertDoesNotThrow(
        () -> streamEnded.get(3, TimeUnit.SECONDS),
        "the stream of a game that is gone should end straight away");
    assertHasGameEndedEvent(lines);
  }

  /**
   * The stream carried a gameended event with data. A browser's EventSource drops an event that
   * has no data line, so without one the board would never hear that the game has ended.
   */
  private static void assertHasGameEndedEvent(List<String> lines) {
    int event = lines.indexOf("event:gameended");
    List<String> events = lines.stream().filter(line -> line.startsWith("event:")).toList();
    assertTrue(event >= 0, "should carry a gameended event, got: " + events);
    assertTrue(event + 1 < lines.size() && lines.get(event + 1).startsWith("data:"),
        "the gameended event needs a data line, or the browser drops it");
  }

  /**
   * Reads the player's stream on a background thread. Counts down {@code firstStateReceived}
   * after the first event (an event ends with a blank line), and completes with every line read
   * once the server ends the stream.
   */
  private static CompletableFuture<List<String>> readStreamUntilItEnds(
      String sessionId, String playerId, CountDownLatch firstStateReceived) {
    String url = "http://localhost:4200/gamestates/" + sessionId + "/" + playerId + "/stream";
    return CompletableFuture.supplyAsync(() -> {
      List<String> lines = new ArrayList<>();
      try {
        HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
        conn.setRequestProperty("Accept", "text/event-stream");
        try (BufferedReader reader =
            new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
          String line;
          while ((line = reader.readLine()) != null) {
            lines.add(line);
            if (line.isEmpty()) {
              firstStateReceived.countDown();
            }
          }
        }
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
      return lines;
    });
  }
}
