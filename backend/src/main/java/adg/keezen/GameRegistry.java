package adg.keezen;

import static com.adg.openapi.model.GameInfo.StatusEnum.IN_PROGRESS;
import static com.adg.openapi.model.GameInfo.StatusEnum.WAITING;

import com.adg.openapi.model.GameInfo;
import jakarta.annotation.Nullable;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

public class GameRegistry {

  // All running games (key = gameId)
  private static final Map<String, GameSession> games = new ConcurrentHashMap<>();
  /** Held while a game is created under a free room name; private, so no other code can take it. */
  private static final Object CREATE_BY_NAME_LOCK = new Object();

  // Create a new game, returns the new game ID
  public static String createNewGame() {
    String sessionId = java.util.UUID.randomUUID().toString();
    games.put(sessionId, new GameSession());
    return sessionId;
  }

  /***
   * For testing purposes
   * @param sessionID
   * @return
   */
  public static String createNewGame(String sessionID) {
    games.put(sessionID, new GameSession(sessionID));
    return sessionID;
  }

  /***
   * For testing purposes
   * @param sessionID
   * @return
   */
  public static String createNewGame(String sessionID, String roomName, Integer maxPlayers) {
    games.put(sessionID, new GameSession(sessionID, roomName, maxPlayers));
    return sessionID;
  }

  /**
   * Create a game under a room name that no game still waiting for players uses — a room name is
   * how players find each other's game to join. A game that has started no longer holds its name:
   * the next game may be started under it while someone still has the old one open. Checking and
   * creating happen as one step, so two creates of the same name at once (a double-clicked
   * "create") cannot both find it free.
   *
   * @return whether the game was created; false if the name is taken
   */
  public static boolean createIfNameFree(String sessionID, String roomName, Integer maxPlayers) {
    synchronized (CREATE_BY_NAME_LOCK) {
      if (games.values().stream().anyMatch(game -> isWaitingUnder(game, roomName))) {
        return false;
      }
      games.put(sessionID, new GameSession(sessionID, roomName, maxPlayers));
      return true;
    }
  }

  private static boolean isWaitingUnder(GameSession game, String roomName) {
    return roomName.equals(game.getRoomName()) && !game.getGameState().hasStarted();
  }

  public static String createTestGame(String sessionID) {
    int animationSpeed = 100;
    GameSession session = new GameSession(new CardsDeckMock(), animationSpeed);
    games.put(sessionID, session);
    return sessionID;
  }

  // Get an existing game by ID
  @Nullable
  public static GameSession getGame(String sessionId) {
    return games.get(sessionId);
  }

  public static GameSession getGameOrThrow(String sessionId) {
    return Objects.requireNonNull(games.get(sessionId), "No game with session: " + sessionId);
  }

  public static List<GameInfo> getAllGames() {
    ArrayList<GameInfo> gameInfos = new ArrayList<>();
    for (GameSession session : games.values()) {
      GameState gameState = session.getGameState();
      GameInfo gameInfo =
          new GameInfo(
              session.getSessionId(),
              session.getRoomName(),
              gameState.getNrPlayers(),
              session.getMaxPlayers(),
              gameState.hasStarted() ? IN_PROGRESS : WAITING);
      gameInfos.add(gameInfo);
    }
    return gameInfos;
  }

  public static void removeGame(String sessionID) {
    games.remove(sessionID);
  }
  //
  //  // Optional: List all session IDs (useful for admin/debugging)
  //  public static Map<String, GameSession> getAllGames() {
  //    return games;
  //  }
  //
}
