package adg.services;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Player;
import org.junit.jupiter.api.Test;

class GameStatePushesTest {

  /** A started two-player game, with the exact-move option set as given. */
  private static GameSession startedGame(boolean exactMoveRequired) {
    GameSession session = new GameSession();
    GameState gs = session.getGameState();
    gs.setExactMoveRequired(exactMoveRequired);
    gs.addPlayer(new Player("0", "0"));
    gs.addPlayer(new Player("1", "1"));
    gs.start(false);
    return session;
  }

  /**
   * The game rules in the client explain what happens at a blocked start tile or the end of the
   * finish, and that answer flips with the exact-move option: a pawn turns around, or the move is
   * refused. The push is the only way the client learns which game it is in, so it must carry the
   * option — every player's push, not only the one whose turn it is.
   */
  @Test
  void forPlayer_tellsEveryPlayerWhetherExactMovesAreRequired() {
    GameSession exact = startedGame(true);
    assertTrue(GameStatePushes.forPlayer(exact, "0", false).isExactMoveRequired(), "player on turn");
    assertTrue(GameStatePushes.forPlayer(exact, "1", false).isExactMoveRequired(), "player waiting");

    GameSession bouncing = startedGame(false);
    assertFalse(GameStatePushes.forPlayer(bouncing, "0", false).isExactMoveRequired());
  }
}
