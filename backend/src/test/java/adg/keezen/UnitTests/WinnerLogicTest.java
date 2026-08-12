package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WinnerLogicTest {

  final ArrayList<String> winners = new ArrayList<>();

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
    winners.clear();
  }

  @Test
  void testOneWinner() {
    // GIVEN
    place4PawnsOnFinish(gameState, "0");

    // WHEN
    gameState.checkForWinners(winners);

    // THEN
    assertTrue(winners.contains("0"));
    assertFalse(Boolean.TRUE.equals(
        gameState.getPlayers().stream().filter(p -> p.getId().equals("0")).findFirst().get().getIsActive()),
        "Player 0 should no longer be active after winning");
  }

  @Test
  void twoPlayers_teamPlayOn_stillRegistersAnIndividualWin() {
    // 2 players cannot form teams (needs an even count of at least 4), so team play must fall back
    // to individual play. Regression: teamPlay used to stay on, and the team win-check kept waiting
    // for a non-existent partner, so a player who got all 4 pawns home was never recorded as a
    // winner (an unwinnable game).
    GameState gs = new GameSession().getGameState();
    gs.setTeamPlay(true);
    gs.addPlayer(new Player("0", "0"));
    gs.addPlayer(new Player("1", "1"));
    gs.start(false);
    assertFalse(gs.isTeamPlay(), "2 players cannot form teams → team play disabled");

    place4PawnsOnFinish(gs, "0");
    ArrayList<String> w = new ArrayList<>();
    gs.checkForWinners(w);
    assertTrue(w.contains("0"), "finishing all pawns must win, even with the team option enabled");
  }

  @Test
  void teamPlay_whenTeammateLeaves_survivorWinsSolo_andLeaverGetsNoMedal() {
    // 4-player team game; team 0 = players 0 & 2. Player 2 leaves (their pawns are removed and are
    // NOT required to come home). Player 0 then finishes their OWN four pawns and wins the team
    // alone; the player who left earns no place.
    GameState gs = new GameSession().getGameState();
    gs.setTeamPlay(true);
    for (int i = 0; i < 4; i++) {
      gs.addPlayer(new Player(String.valueOf(i), String.valueOf(i)));
    }
    gs.start(false);
    gs.processLeaveGame("2");

    place4PawnsOnFinish(gs, "0"); // only the survivor's own four

    ArrayList<String> w = new ArrayList<>();
    gs.checkForWinners(w);
    assertTrue(w.contains("0"), "the survivor wins the team on their own four pawns");
    assertFalse(w.contains("2"), "a player who left earns no place");
  }

  @Test
  void whenSomeoneWins_HandGetsEmptied_NextPlayerPLays() {
    // GIVEN 3 pawns already on finish, pawn 3 one step away on the preceding player's section
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 17));
    placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 18));
    placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 19));
    Pawn pawn3 = placePawnOnBoard(gameState, new PawnId("0", 3), new PositionKey("2", 15));
    Card ace = givePlayerCard(cardsDeck, 0, 1);

    // WHEN the last card (Ace) is played to move pawn 3 into the finish lane
    MoveRequest moveRequest = new MoveRequest();
    createMoveRequest(moveRequest, pawn3, ace);
    gameState.processOnMove(moveRequest, new MoveResponse());

    // THEN player "0" won, hand is emptied, next player plays
    assertTrue(gameState.getWinners().contains("0"));
    assertEquals(0, cardsDeck.getCardsForPlayer("0").size());
    assertEquals("1", gameState.getPlayerIdTurn());
    assertFalse(Boolean.TRUE.equals(
        gameState.getPlayers().stream().filter(p -> p.getId().equals("0")).findFirst().get().getIsActive()),
        "Player 0 should no longer be active after winning");
  }

  @Test
  void whenPlayer2Wins_ItsPlayer1sTurn_WhenHeWins_ItsPlayers0sTurn() {
    // GIVEN player 0 and player 1 forfeit their round cards
    gameState.processOnForfeit("0");
    gameState.processOnForfeit("1");

    // GIVEN player 2 has 3 pawns on finish and pawn 3 one step away (preceding section is "1")
    placePawnOnBoard(gameState, new PawnId("2", 0), new PositionKey("2", 19));
    placePawnOnBoard(gameState, new PawnId("2", 1), new PositionKey("2", 18));
    placePawnOnBoard(gameState, new PawnId("2", 2), new PositionKey("2", 17));
    Pawn pawn2_3 = placePawnOnBoard(gameState, new PawnId("2", 3), new PositionKey("1", 15));
    Card ace2 = givePlayerAce(cardsDeck, 2);

    // WHEN player 2 wins by playing Ace
    MoveRequest req2 = new MoveRequest();
    createMoveRequest(req2, pawn2_3, ace2);
    gameState.processOnMove(req2, new MoveResponse());

    // THEN a new round started; player 1 has the turn (next after player 0 who started round 1)
    assertTrue(gameState.getWinners().contains("2"));
    assertEquals("1", gameState.getPlayerIdTurn());

    // GIVEN player 1 has 3 pawns on finish and pawn 3 one step away (preceding section is "0")
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 19));
    placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 18));
    placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 17));
    Pawn pawn1_3 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("0", 15));
    Card ace1 = givePlayerAce(cardsDeck, 1);

    // WHEN player 1 wins by playing Ace
    MoveRequest req1 = new MoveRequest();
    createMoveRequest(req1, pawn1_3, ace1);
    gameState.processOnMove(req1, new MoveResponse());

    // THEN it's player 0's turn and no winner is shown as playing or active
    assertTrue(gameState.getWinners().contains("1"));
    assertEquals("0", gameState.getPlayerIdTurn());
    assertFalse(gameState.getWinners().stream().anyMatch(winnerId ->
        gameState.getPlayers().stream()
            .anyMatch(p -> p.getId().equals(winnerId) && Boolean.TRUE.equals(p.getIsPlaying()))));
    assertFalse(gameState.getWinners().stream().anyMatch(winnerId ->
        gameState.getPlayers().stream()
            .anyMatch(p -> p.getId().equals(winnerId) && Boolean.TRUE.equals(p.getIsActive()))),
        "No winner should still be active");
  }

  @Test
  void testPlayer2Wins_ThenPlayer1Wins() {
    // GIVEN
    place4PawnsOnFinish(gameState, "2");
    gameState.checkForWinners(winners);

    // WHEN
    place4PawnsOnFinish(gameState, "1");
    gameState.checkForWinners(winners);

    // THEN
    assertEquals(stringsToList(new String[] {"2", "1"}), winners);
    assertFalse(Boolean.TRUE.equals(
        gameState.getPlayers().stream().filter(p -> p.getId().equals("2")).findFirst().get().getIsActive()),
        "Player 2 should no longer be active after winning");
    assertFalse(Boolean.TRUE.equals(
        gameState.getPlayers().stream().filter(p -> p.getId().equals("1")).findFirst().get().getIsActive()),
        "Player 1 should no longer be active after winning");
  }

  @Test
  void whenPlayer1WinsInTwoPlayerGame_Player1GetsFirstMedal_NotPlayer0() {
    // Re-setup with 2 players: player "0" (red) and player "1" (blue)
    createGame_With_NPlayers(gameState, 2);

    // GIVEN player "0" forfeits this round so player "1" has the turn
    gameState.processOnForfeit("0");

    // GIVEN player "1" has 3 pawns on their finish and pawn 3 one step away in player "0"'s section
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 17));
    placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 18));
    placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 19));
    Pawn pawn1_3 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("0", 15));
    Card ace = givePlayerAce(cardsDeck, 1);

    // WHEN player "1" plays the Ace to move their last pawn into the finish
    MoveRequest moveRequest = new MoveRequest();
    createMoveRequest(moveRequest, pawn1_3, ace);
    gameState.processOnMove(moveRequest, new MoveResponse());

    // THEN player "1" wins with place 1, and player "0" does NOT receive a medal
    assertTrue(gameState.getWinners().contains("1"), "Player 1 (blue) should be in the winners list");
    assertEquals(1,
        gameState.getPlayers().stream().filter(p -> p.getId().equals("1")).findFirst().get().getPlace(),
        "Player 1 (blue) should have place 1 — the first medal");
    assertEquals(-1,
        gameState.getPlayers().stream().filter(p -> p.getId().equals("0")).findFirst().get().getPlace(),
        "Player 0 (red) should NOT have a medal — place should remain -1");
    assertFalse(Boolean.TRUE.equals(
        gameState.getPlayers().stream().filter(p -> p.getId().equals("1")).findFirst().get().getIsActive()),
        "Player 1 (blue) should no longer be active after winning");
  }

  @Test
  void whenPlayer0WinsInTwoPlayerGame_Player0GetsFirstMedal_NotPlayer1() {
    // Re-setup with 2 players: player "0" (red) and player "1" (blue)
    createGame_With_NPlayers(gameState, 2);

    // GIVEN player "0" has 3 pawns on their finish and pawn 3 one step away in player "1"'s section
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 17));
    placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 18));
    placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 19));
    Pawn pawn0_3 = placePawnOnBoard(gameState, new PawnId("0", 3), new PositionKey("1", 15));
    Card ace = givePlayerAce(cardsDeck, 0);

    // WHEN player "0" plays the Ace to move their last pawn into the finish
    MoveRequest moveRequest = new MoveRequest();
    createMoveRequest(moveRequest, pawn0_3, ace);
    gameState.processOnMove(moveRequest, new MoveResponse());

    // THEN player "0" wins with place 1, and player "1" does NOT receive a medal
    assertTrue(gameState.getWinners().contains("0"), "Player 0 (red) should be in the winners list");
    assertEquals(1,
        gameState.getPlayers().stream().filter(p -> p.getId().equals("0")).findFirst().get().getPlace(),
        "Player 0 (red) should have place 1 — the first medal");
    assertEquals(-1,
        gameState.getPlayers().stream().filter(p -> p.getId().equals("1")).findFirst().get().getPlace(),
        "Player 1 (blue) should NOT have a medal — place should remain -1");
    assertFalse(Boolean.TRUE.equals(
        gameState.getPlayers().stream().filter(p -> p.getId().equals("0")).findFirst().get().getIsActive()),
        "Player 0 (red) should no longer be active after winning");
  }

  @Test
  void teamPlay_firstTeamPlacesFirst_secondTeamPlacesSecond_bothMembersShareThePlace() {
    // 4-player team game; teams pair opposite seats: {0,2} and {1,3}. Team {0,2} brings all eight
    // of their pawns home first and takes place 1; then team {1,3} finishes and takes place 2.
    GameState gs = new GameSession().getGameState();
    gs.setTeamPlay(true);
    for (int i = 0; i < 4; i++) {
      gs.addPlayer(new Player(String.valueOf(i), String.valueOf(i)));
    }
    gs.start(false);
    assertTrue(gs.isTeamPlay(), "4 players must form teams");

    ArrayList<String> w = new ArrayList<>();

    // Team {0,2} finishes: both members must be fully home before the team places.
    place4PawnsOnFinish(gs, "0");
    place4PawnsOnFinish(gs, "2");
    gs.checkForWinners(w);
    assertTrue(w.contains("0") && w.contains("2"), "team {0,2} places once both members are home");
    assertFalse(w.contains("1") || w.contains("3"), "team {1,3} has not finished yet");

    // Team {1,3} finishes second and must place behind team {0,2}, not tie at place 1.
    place4PawnsOnFinish(gs, "1");
    place4PawnsOnFinish(gs, "3");
    gs.checkForWinners(w);

    assertEquals(1, placeOf(gs, "0"), "team {0,2} member 0 → place 1");
    assertEquals(1, placeOf(gs, "2"), "team {0,2} member 2 → place 1");
    assertEquals(2, placeOf(gs, "1"), "team {1,3} member 1 → place 2 (behind the first team)");
    assertEquals(2, placeOf(gs, "3"), "team {1,3} member 3 → place 2 (behind the first team)");

    Player firstWinner = gs.getPlayers().stream().filter(p -> p.getId().equals("0")).findFirst().get();
    assertFalse(Boolean.TRUE.equals(firstWinner.getIsPlaying()), "a placed winner stops playing");
    assertFalse(Boolean.TRUE.equals(firstWinner.getIsActive()), "a placed winner is no longer active");
  }

  private static int placeOf(GameState gs, String playerId) {
    return gs.getPlayers().stream().filter(p -> p.getId().equals(playerId)).findFirst().get().getPlace();
  }

  @Test
  void testPlayer2Wins_Player0Wins_ThenPlayer1Wins() {
    // GIVEN
    place4PawnsOnFinish(gameState, "2");
    gameState.checkForWinners(winners);
    place4PawnsOnFinish(gameState, "0");
    gameState.checkForWinners(winners);

    // WHEN
    place4PawnsOnFinish(gameState, "1");
    gameState.checkForWinners(winners);

    // THEN
    assertEquals(stringsToList(new String[] {"2", "0", "1"}), winners);
    assertFalse(Boolean.TRUE.equals(
        gameState.getPlayers().stream().filter(p -> p.getId().equals("2")).findFirst().get().getIsActive()),
        "Player 2 should no longer be active after winning");
    assertFalse(Boolean.TRUE.equals(
        gameState.getPlayers().stream().filter(p -> p.getId().equals("0")).findFirst().get().getIsActive()),
        "Player 0 should no longer be active after winning");
    assertFalse(Boolean.TRUE.equals(
        gameState.getPlayers().stream().filter(p -> p.getId().equals("1")).findFirst().get().getIsActive()),
        "Player 1 should no longer be active after winning");
  }
}
