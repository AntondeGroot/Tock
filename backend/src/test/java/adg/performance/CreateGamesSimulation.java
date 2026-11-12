package adg.performance;

import static adg.performance.GameRequests.createGame;
import static adg.performance.GameRequests.httpProtocol;
import static adg.performance.GameRequests.seatPlayers;
import static adg.performance.GameRequests.startGame;
import static adg.performance.GameRequests.startUsers;
import static adg.performance.GameRequests.stopGame;
import static io.gatling.javaapi.core.CoreDsl.global;
import static io.gatling.javaapi.core.CoreDsl.scenario;
import static io.gatling.javaapi.http.HttpDsl.http;
import static io.gatling.javaapi.http.HttpDsl.status;

import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;

/**
 * X games created, each with Y players: all at once, or spread over a ramp of some seconds. One
 * virtual user hosts one game: it creates the game, seats the players, starts it, reads its state,
 * and stops it again so no games are left behind.
 *
 * <p>Run against a backend that is already up:
 *
 * <pre>
 * mvn gatling:test -Dgatling.simulationClass=adg.performance.CreateGamesSimulation \
 *     -Dgames=20 -Dplayers=6 -Dramp=10 -DbaseUrl=http://localhost:4200
 * </pre>
 *
 * <p>Without a ramp every game starts in the same instant. A large burst like that can overflow
 * the server's queue of connections waiting to be accepted, and those are reset.
 */
public final class CreateGamesSimulation extends Simulation {

  private static final int NR_GAMES = Integer.getInteger("games", 1000);
  private static final int NR_PLAYERS = Integer.getInteger("players", 4);
  /** Seconds over which the games are started evenly; 0 starts them all at once. */
  private static final int RAMP_SECONDS = Integer.getInteger("ramp", 0);

  private final ScenarioBuilder hostAGame =
      scenario("Host a game with " + NR_PLAYERS + " players")
          .exec(createGame(NR_PLAYERS))
          .exitHereIfFailed() // without a sessionId, the rest of the game can only fail
          .exec(seatPlayers(NR_PLAYERS))
          .exec(startGame())
          .exec(http("get game state").get("/gamestates/#{sessionId}").check(status().is(200)))
          .exec(stopGame());

  public CreateGamesSimulation() {
    setUp(hostAGame.injectOpen(startUsers(NR_GAMES, RAMP_SECONDS)))
        .protocols(httpProtocol())
        .assertions(
            global().failedRequests().count().is(0L),
            global().responseTime().percentile(95.0).lt(500));
  }
}
