package adg;

import adg.keezen.GameRegistry;
import adg.keezen.GameSession;
import jakarta.annotation.Nullable;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Handles the requests for one game one at a time. The game state is plain, unsynchronized
 * collections: two requests running side by side — a double-clicked move — both passed the turn
 * check and both took the last card out of the hand, leaving it broken (size -1) for good. Every
 * request that names a running game in its path holds that game's lock while it is handled;
 * requests for different games, and requests naming no game, are not held up.
 */
@Component
public class GameLockFilter extends OncePerRequestFilter {

  // The API resources addressed as /{resource}/{sessionId}/...
  private static final Set<String> GAME_RESOURCES =
      Set.of("games", "moves", "cards", "trade", "gamestates");

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    GameSession game = gameNamedBy(request);
    if (game == null) {
      filterChain.doFilter(request, response);
      return;
    }
    synchronized (game) {
      filterChain.doFilter(request, response);
    }
  }

  /** The running game whose session id is in the request path, if any. */
  @Nullable
  private static GameSession gameNamedBy(HttpServletRequest request) {
    String path = request.getRequestURI().substring(request.getContextPath().length());
    String[] segments = path.split("/"); // "/moves/{sessionId}/{playerId}" → "", "moves", id, …
    if (segments.length < 3 || !GAME_RESOURCES.contains(segments[1])) {
      return null;
    }
    return GameRegistry.getGame(segments[2]);
  }
}
