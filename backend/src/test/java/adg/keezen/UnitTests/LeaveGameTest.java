package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LeaveGameTest {

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setup() {
    GameSession session = new GameSession();
    gameState = session.getGameState();
    cardsDeck = session.getCardsDeck();
    createGame_With_NPlayers(gameState, 3);
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
  }

  @Test
  void whenPlayerLeaves_theirPawnsAreRemovedFromTheBoard() {
    // GIVEN player "0" has pawns on the board
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 3));
    placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 5));
    placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("1", 2));
    placePawnOnBoard(gameState, new PawnId("0", 3), new PositionKey("2", 10));

    // WHEN player "0" leaves
    gameState.processLeaveGame("0");

    // THEN a departed player is out — their pawns are removed from the board entirely
    assertTrue(
        gameState.getPawns().stream().noneMatch(p -> "0".equals(p.getPlayerId())),
        "a departed player's pawns should be removed from the board");
  }

  @Test
  void whenPlayerLeaves_theyAreSetInactive_andHaveNoMedal() {
    // WHEN player "0" leaves
    gameState.processLeaveGame("0");

    // THEN they are not active, not playing, and have no medal (place = -1)
    gameState.getPlayers().stream()
        .filter(p -> p.getId().equals("0"))
        .findFirst()
        .ifPresent(player -> {
          assertFalse(Boolean.TRUE.equals(player.getIsActive()),
              "Leaver should be inactive");
          assertFalse(Boolean.TRUE.equals(player.getIsPlaying()),
              "Leaver should not be playing");
          assertEquals(-1, player.getPlace(),
              "Leaver should have no medal (place = -1)");
        });
  }

  @Test
  void whenPlayerLeaves_theirCardsAreForfeited() {
    // GIVEN player "0" has cards
    givePlayerCard(cardsDeck, 0, 5);
    assertFalse(cardsDeck.getCardsForPlayer("0").isEmpty(),
        "Player should have cards before leaving");

    // WHEN player "0" leaves
    gameState.processLeaveGame("0");

    // THEN their hand is empty
    assertTrue(cardsDeck.getCardsForPlayer("0").isEmpty(),
        "Leaver's cards should be forfeited");
  }

  @Test
  void whenCurrentPlayerLeaves_turnAdvancesToNextActivePlayer() {
    // GIVEN player "0" has the turn (they start by default)
    assertEquals("0", gameState.getPlayerIdTurn());

    // WHEN player "0" leaves
    gameState.processLeaveGame("0");

    // THEN the turn moves to the next active player
    String nextTurn = gameState.getPlayerIdTurn();
    assertNotEquals("0", nextTurn, "Turn should have advanced away from the leaver");
    assertTrue(gameState.getActivePlayers().contains(nextTurn),
        "Turn should go to an active player");
  }

  @Test
  void whenNonCurrentPlayerLeaves_turnDoesNotChange() {
    // GIVEN player "0" has the turn (they start by default)
    assertEquals("0", gameState.getPlayerIdTurn());

    // WHEN player "1" (not their turn) leaves
    gameState.processLeaveGame("1");

    // THEN the turn is unchanged
    assertEquals("0", gameState.getPlayerIdTurn(),
        "Turn should stay with player 0 when a different player leaves");
  }

  @Test
  void whenPlayerLeaves_theyAreNotReactivatedInNextRound() {
    // WHEN player "0" leaves, then the other players forfeit to trigger a new round
    gameState.processLeaveGame("0");
    gameState.processOnForfeit("1");
    gameState.processOnForfeit("2");

    // THEN player "0" is still inactive in the new round
    gameState.getPlayers().stream()
        .filter(p -> p.getId().equals("0"))
        .findFirst()
        .ifPresent(player ->
            assertFalse(Boolean.TRUE.equals(player.getIsActive()),
                "Leaver should remain inactive in the next round"));
  }

  @Test
  void allPlayersHaveLeft_returnsTrueOnlyWhenEveryoneLeft() {
    // GIVEN no one has left yet
    assertFalse(gameState.allPlayersHaveLeft(), "Should be false when no one has left");

    // WHEN player "0" leaves
    gameState.processLeaveGame("0");
    assertFalse(gameState.allPlayersHaveLeft(), "Should be false when only one of three left");

    // WHEN player "1" leaves
    gameState.processLeaveGame("1");
    assertFalse(gameState.allPlayersHaveLeft(), "Should be false when only two of three left");

    // WHEN the last player leaves
    gameState.processLeaveGame("2");
    assertTrue(gameState.allPlayersHaveLeft(), "Should be true when all players have left");
  }

  @Test
  void leaver_isDistinctFromWinner_andGetsNoMedal() {
    // GIVEN player "2" wins
    place4PawnsOnFinish(gameState, "2");
    gameState.checkForWinners(new java.util.ArrayList<>());

    // WHEN player "0" leaves
    gameState.processLeaveGame("0");

    // THEN player "2" has a medal (place > 0) but player "0" does not
    int place2 = gameState.getPlayers().stream()
        .filter(p -> p.getId().equals("2")).findFirst().get().getPlace();
    int place0 = gameState.getPlayers().stream()
        .filter(p -> p.getId().equals("0")).findFirst().get().getPlace();

    assertTrue(place2 > 0, "Winner should have a medal");
    assertEquals(-1, place0, "Leaver should not have a medal");
  }
}