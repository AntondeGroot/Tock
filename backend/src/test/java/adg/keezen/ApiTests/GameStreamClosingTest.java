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
    CompletableFuture<Void> streamEnded = readStreamUntilItEnds(sessionId, playerId, firstStateReceived);
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
    CompletableFuture<Void> streamEnded = readStreamUntilItEnds(sessionId, playerId, firstStateReceived);
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
   * Reads the player's stream on a background thread. Counts down {@code firstStateReceived}
   * after the first event (an event ends with a blank line), and completes once the server ends
   * the stream.
   */
  private static CompletableFuture<Void> readStreamUntilItEnds(
      String sessionId, String playerId, CountDownLatch firstStateReceived) {
    String url = "http://localhost:4200/gamestates/" + sessionId + "/" + playerId + "/stream";
    return CompletableFuture.runAsync(() -> {
      try {
        HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
        conn.setRequestProperty("Accept", "text/event-stream");
        try (BufferedReader reader =
            new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
          String line;
          while ((line = reader.readLine()) != null) {
            if (line.isEmpty()) {
              firstStateReceived.countDown();
            }
          }
        }
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
    });
  }
}
