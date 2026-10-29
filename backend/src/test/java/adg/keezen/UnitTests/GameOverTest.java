package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.Player;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The game ends once every seated player has either finished or left: no new round is dealt and
 * nobody is on turn any more, so the clients can send everyone back to the game room.
 */
class GameOverTest {

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setUp() {
    GameSession session = new GameSession();
    gameState = session.getGameState();
    cardsDeck = session.getCardsDeck();
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
    cardsDeck.reset();
  }

  @Test
  void whenEveryoneStillPresentHasFinished_theGameIsOver_andNobodyGetsAnotherTurn() {
    // GIVEN a three-player game where player 2 left and player 0 already finished
    createGame_With_NPlayers(gameState, 3);
    gameState.processLeaveGame("2");
    place4PawnsOnFinish(gameState, "0");
    gameState.checkForWinners(gameState.getWinners());
    gameState.removeWinnerFromActivePlayerList();

    // WHEN player 1 brings their last pawn home and ends the turn
    place4PawnsOnFinish(gameState, "1");
    Card card = givePlayerCard(cardsDeck, 1, 5);
    gameState.finishTurn("1", card, true);

    // THEN the game is over: no fresh round, nobody on turn
    assertTrue(gameState.isGameOver(), "everyone still at the table has finished");
    assertTrue(
        gameState.getPlayers().stream().noneMatch(p -> p.getIsPlaying() != null && p.getIsPlaying()),
        "nobody may get a turn once the game is over");
  }
}
