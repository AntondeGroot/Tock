package adg.performance;

import static io.gatling.javaapi.core.CoreDsl.StringBody;
import static io.gatling.javaapi.core.CoreDsl.atOnceUsers;
import static io.gatling.javaapi.core.CoreDsl.exec;
import static io.gatling.javaapi.core.CoreDsl.jsonPath;
import static io.gatling.javaapi.core.CoreDsl.rampUsers;
import static io.gatling.javaapi.core.CoreDsl.repeat;
import static io.gatling.javaapi.http.HttpDsl.http;
import static io.gatling.javaapi.http.HttpDsl.status;

import io.gatling.javaapi.core.ChainBuilder;
import io.gatling.javaapi.core.OpenInjectionStep;
import io.gatling.javaapi.http.HttpProtocolBuilder;
import java.time.Duration;
import java.util.UUID;

/**
 * The requests every simulation shares: reach the backend, and set up and tear down a game. A
 * virtual user that runs {@link #createGame} keeps the game's id in its session as {@code
 * sessionId}, and the other requests use it.
 */
final class GameRequests {

  static final String BASE_URL = System.getProperty("baseUrl", "http://localhost:4200");

  private GameRequests() {}

  static HttpProtocolBuilder httpProtocol() {
    return http.baseUrl(BASE_URL)
        .contentTypeHeader("application/json")
        .acceptHeader("application/json");
  }

  /** {@code nrGames} users: all in the same instant, or spread evenly over {@code rampSeconds}. */
  static OpenInjectionStep startUsers(int nrGames, int rampSeconds) {
    return rampSeconds > 0
        ? rampUsers(nrGames).during(Duration.ofSeconds(rampSeconds))
        : atOnceUsers(nrGames);
  }

  /** Creates a game with a unique room name, and keeps its sessionId for the requests after. */
  static ChainBuilder createGame(int nrPlayers) {
    return exec(session -> session.set("roomName", "load-" + UUID.randomUUID()))
        .exec(
            http("create game")
                .post("/games")
                .body(StringBody("{\"roomName\":\"#{roomName}\",\"maxPlayers\":" + nrPlayers + "}"))
                .check(status().is(201), jsonPath("$.sessionId").saveAs("sessionId")));
  }

  /** Seats players {@code player0}, {@code player1}, … (an id only has to be unique per game). */
  static ChainBuilder seatPlayers(int nrPlayers) {
    return repeat(nrPlayers, "seat")
        .on(
            exec(
                http("add player")
                    .post("/games/#{sessionId}/players")
                    .body(StringBody("{\"id\":\"player#{seat}\",\"name\":\"player#{seat}\"}"))
                    .check(status().is(201))));
  }

  static ChainBuilder startGame() {
    return exec(http("start game").post("/games/#{sessionId}").check(status().is(200)));
  }

  static ChainBuilder stopGame() {
    return exec(http("stop game").delete("/games/#{sessionId}").check(status().is(204)));
  }
}
