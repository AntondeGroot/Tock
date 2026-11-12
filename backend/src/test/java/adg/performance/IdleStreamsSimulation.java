package adg.performance;

import static adg.performance.GameRequests.createGame;
import static adg.performance.GameRequests.httpProtocol;
import static adg.performance.GameRequests.seatPlayers;
import static adg.performance.GameRequests.startGame;
import static adg.performance.GameRequests.startUsers;
import static adg.performance.GameRequests.stopGame;
import static io.gatling.javaapi.core.CoreDsl.details;
import static io.gatling.javaapi.core.CoreDsl.exec;
import static io.gatling.javaapi.core.CoreDsl.global;
import static io.gatling.javaapi.core.CoreDsl.group;
import static io.gatling.javaapi.core.CoreDsl.jsonPath;
import static io.gatling.javaapi.core.CoreDsl.repeat;
import static io.gatling.javaapi.core.CoreDsl.scenario;
import static io.gatling.javaapi.http.HttpDsl.http;
import static io.gatling.javaapi.http.HttpDsl.sse;
import static io.gatling.javaapi.http.HttpDsl.status;

import io.gatling.javaapi.core.ChainBuilder;
import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;
import io.gatling.javaapi.http.SseMessageCheck;
import java.time.Duration;

/**
 * Many players connected, all of them idle: what an open live stream (SSE) costs the server. That
 * cost grows with the number of connected players, not with the number of games.
 *
 * <p>One virtual user is one table. It creates and starts a game and opens a stream for every
 * seat. Then one player leaves, so every stream gets a push: the server starts a stream's sender
 * thread on its first push, so without one an idle stream would cost no thread at all. The streams
 * stay open for the hold time, then close, and the game is stopped.
 *
 * <p>Run against a backend that is already up:
 *
 * <pre>
 * mvn gatling:test -Dgatling.simulationClass=adg.performance.IdleStreamsSimulation \
 *     -Dgames=100 -Dplayers=6 -Dramp=10 -Dhold=60 -DbaseUrl=http://localhost:4200
 * </pre>
 *
 * <p>Gatling cannot see inside the server, so count its threads while the streams are held, and
 * again after the run, when the count should be back to where it started:
 *
 * <pre>jcmd $(lsof -ti tcp:4200 -sTCP:LISTEN) Thread.print | grep -c '"sse-sender-'</pre>
 */
public final class IdleStreamsSimulation extends Simulation {

  private static final int NR_GAMES = Integer.getInteger("games", 100);
  private static final int NR_PLAYERS = Integer.getInteger("players", 6);
  /** Seconds over which the tables are started evenly; 0 starts them all at once. */
  private static final int RAMP_SECONDS = Integer.getInteger("ramp", 10);
  /** Seconds every stream stays open, idle, after its push. */
  private static final int HOLD_SECONDS = Integer.getInteger("hold", 60);
  /** How long a new stream may take to send its first game state before that counts as failed. */
  private static final Duration DELIVERY_TIMEOUT = Duration.ofSeconds(10);

  /** One stream per seat, so the user can hold all of its table's streams at once. */
  private static final String STREAM = "stream-#{seat}";
  /** Gatling hands each SSE message over as JSON, with the event name in its "event" field. */
  private static final String GAME_STATE_EVENT = "\"event\":\"gamestate\"";
  private static final String PUSH_DELIVERED = "push delivered";
  /**
   * Gatling drops messages that arrive while no check waits for them, unless it is told to keep
   * some. One push is expected per stream; the margin leaves room for a few more.
   */
  private static final int UNMATCHED_BUFFER_SIZE = 8;

  private final ScenarioBuilder holdATable =
      scenario("Hold " + NR_PLAYERS + " idle streams per table")
          .exec(createGame(NR_PLAYERS))
          .exitHereIfFailed() // without a sessionId, the rest of the table can only fail
          .exec(seatPlayers(NR_PLAYERS))
          .exec(startGame())
          .exec(openStreams())
          .exec(http("player0 leaves").delete("/games/#{sessionId}/players/player0")
              .check(status().is(204)))
          .pause(Duration.ofSeconds(HOLD_SECONDS))
          .exec(checkEveryStreamGotThePush())
          .exec(closeStreams())
          .exec(stopGame());

  public IdleStreamsSimulation() {
    setUp(holdATable.injectOpen(startUsers(NR_GAMES, RAMP_SECONDS)))
        .protocols(httpProtocol().sseUnmatchedInboundMessageBufferSize(UNMATCHED_BUFFER_SIZE))
        .assertions(
            global().failedRequests().count().is(0L),
            details(PUSH_DELIVERED).failedRequests().count().is(0L));
  }

  /** Opens every seat's stream, each one answered with the game state the player starts from. */
  private static ChainBuilder openStreams() {
    return forEverySeat(
        exec(
            sse("open stream")
                .sseName(STREAM)
                .get("/gamestates/#{sessionId}/player#{seat}/stream")
                .await(DELIVERY_TIMEOUT)
                .on(gameState("initial game state"))));
  }

  /**
   * Did every stream get the game state pushed when player0 left? The push arrives within moments
   * of the leave request, before a check could be set to wait for it, so Gatling keeps it as an
   * unmatched message. Looking among those after the hold has no race. A stream without the push
   * fails its {@link #PUSH_DELIVERED} group.
   */
  private static ChainBuilder checkEveryStreamGotThePush() {
    return forEverySeat(
        group(PUSH_DELIVERED)
            .on(
                exec(
                    sse.processUnmatchedMessages(
                        STREAM,
                        (messages, session) ->
                            messages.stream().anyMatch(m -> m.message().contains(GAME_STATE_EVENT))
                                ? session
                                : session.markAsFailed()))));
  }

  private static ChainBuilder closeStreams() {
    return forEverySeat(exec(sse("close stream").sseName(STREAM).close()));
  }

  private static ChainBuilder forEverySeat(ChainBuilder perSeat) {
    return repeat(NR_PLAYERS, "seat").on(perSeat);
  }

  private static SseMessageCheck gameState(String name) {
    return sse.checkMessage(name).check(jsonPath("$.event").is("gamestate"));
  }
}
