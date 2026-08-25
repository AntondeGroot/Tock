package adg.keezen.UnitTests;

import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.util.PlayerStatus;
import adg.processing.ProcessOnMove;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import com.adg.openapi.model.Player;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Verifies the twoPlayersOnFourSeats option: a two-player game played on a four-seat board. The
 * two players sit opposite each other (seats 0 and 2) with an empty seat between them either way,
 * so there is twice as much board to cross. An empty seat owns a section of that board and nothing
 * else — no pawns, no cards, no turn.
 */
class WideBoardForTwoTest {

  private GameState gameState;
  private CardsDeckInterface cardsDeck;
  private MoveRequest moveMessage;
  private MoveResponse moveResponse;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();
    moveMessage = new MoveRequest();
    moveResponse = new MoveResponse();
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
    cardsDeck.reset();
  }

  /** Seat two players and start, with the option on. No shuffle, so seating order is Ann, Bob. */
  private void startWidenedGameForTwo() {
    gameState.setTwoPlayersOnFourSeats(true);
    gameState.addPlayer(new Player("A", "Ann"));
    gameState.addPlayer(new Player("B", "Bob"));
    gameState.start(false);
  }

  /** Put one card of {@code value} in a player's hand — these ids are names, not seat numbers. */
  private Card giveCard(String playerId, int value) {
    Card card = new Card().suit(0).value(value).uuid(999);
    cardsDeck.setPlayerCard(playerId, card);
    return card;
  }

  @Test
  void twoPlayers_areSeatedOppositeEachOther_withAnEmptySeatBetween() {
    // WHEN
    startWidenedGameForTwo();

    // THEN the table has four seats, the two players facing each other across it
    List<Player> seats = gameState.getPlayers();
    assertEquals(4, seats.size());
    assertEquals(List.of("A", "B"), seats.stream().filter(p -> !PlayerStatus.isPlaceholder(p))
        .map(Player::getId).toList());
    assertEquals(0, seats.get(0).getPlayerInt()); // Ann
    assertEquals(2, seats.get(2).getPlayerInt()); // Bob, directly opposite

    // THEN the seats between them are empty: nobody sits there and nobody plays them
    assertTrue(PlayerStatus.isPlaceholder(seats.get(1)));
    assertTrue(PlayerStatus.isPlaceholder(seats.get(3)));
    assertEquals(List.of("A", "B"), gameState.getActivePlayers());

    // THEN an empty seat owns board and nothing else — no pawns of its own, and no cards
    assertEquals(8, gameState.getPawns().size()); // four each, for the two real players only
    assertEquals(
        Set.of("A", "B"),
        gameState.getPawns().stream().map(Pawn::getPlayerId).collect(Collectors.toSet()));
    assertEquals(0, cardsDeck.getNrOfCardsPerPlayer().get(seats.get(1).getId()));
    assertEquals(0, cardsDeck.getNrOfCardsPerPlayer().get(seats.get(3).getId()));
  }

  // The whole point of the option: the board between the two players is twice as long, because
  // what lies past the end of your own section is now an empty seat's stretch of track rather
  // than your opponent's section.
  @Test
  void aPawn_travelsThroughAnEmptySeatsSection() {
    // GIVEN a pawn of Ann's on the last tile of her own section
    startWidenedGameForTwo();
    Card card = giveCard("A", 2);
    Pawn pawn = GameStateUtil.placePawnOnBoard(
        gameState, new PawnId("A", 0), new PositionKey("A", 15));

    // WHEN it steps two forward, off the end of that section
    GameStateUtil.createMoveRequest(moveMessage, pawn, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN it carries on onto board belonging to an EMPTY seat, rather than onto Bob's section
    // as it would on a two-seat board. Asserting on the seat's emptiness, not on which index it
    // sits at, is what makes this a statement about the widened board.
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    PositionKey landed = gameState.getPawn(pawn).getCurrentTileId();
    assertEquals(1, landed.getTileNr());
    assertTrue(
        PlayerStatus.isPlaceholder(seatById(landed.getPlayerId())),
        "the pawn should have crossed onto an empty seat's stretch of board");
  }

  // A pawn only turns into its finish off the section immediately before its own. On the widened
  // board that section belongs to an empty seat, so this checks the turn-in still happens where a
  // player never sits — four sections around instead of two.
  @Test
  void aPawn_stillTurnsIntoItsOwnFinish_afterTheLastSection() {
    // GIVEN a pawn of Ann's at the end of the section just before hers, which is now an empty one
    startWidenedGameForTwo();
    String lastSection = gameState.previousPlayerId("A");
    assertTrue(
        PlayerStatus.isPlaceholder(seatById(lastSection)),
        "the section before Ann's should be an empty seat's on a widened board");
    Card card = giveCard("A", 1);
    Pawn pawn = GameStateUtil.placePawnOnBoard(
        gameState, new PawnId("A", 0), new PositionKey(lastSection, 15));

    // WHEN it takes the one step off the end of that section
    GameStateUtil.createMoveRequest(moveMessage, pawn, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN it turns into Ann's OWN finish lane
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("A", 16), gameState.getPawn(pawn).getCurrentTileId());
  }

  // An empty seat owns a section of board but is not somebody waiting to act. If it ever entered
  // the turn order, play would stall on a chair — and the same list feeds the deal, so it would be
  // dealt cards too.
  @Test
  void theTurn_passesStraightFromOnePlayerToTheOther() {
    // GIVEN Ann to play, with a pawn out on her own section
    startWidenedGameForTwo();
    assertEquals("A", gameState.getPlayerIdTurn());
    Card card = giveCard("A", 2);
    Pawn pawn = GameStateUtil.placePawnOnBoard(
        gameState, new PawnId("A", 0), new PositionKey("A", 5));

    // WHEN she plays it
    GameStateUtil.createMoveRequest(moveMessage, pawn, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN it is Bob's turn, with no empty-seat beat in between
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals("B", gameState.getPlayerIdTurn());
  }

  // The option describes a pair sitting opposite each other, which only a table of two can be.
  // A larger table is left exactly as it was rather than being spread over twice the seats.
  @Test
  void theOption_isIgnoredWithMoreThanTwoPlayers() {
    // GIVEN the option on, but four players at the table
    gameState.setTwoPlayersOnFourSeats(true);
    for (String id : List.of("A", "B", "C", "D")) {
      gameState.addPlayer(new Player(id, id));
    }

    // WHEN the game starts
    gameState.start(false);

    // THEN the table is the ordinary four-seat one, every seat taken by a player
    assertEquals(4, gameState.getPlayers().size());
    assertTrue(gameState.getPlayers().stream().noneMatch(PlayerStatus::isPlaceholder));
    assertEquals(List.of("A", "B", "C", "D"), gameState.getActivePlayers());
    assertEquals(16, gameState.getPawns().size()); // four pawns each, for four players
  }

  // A widened table has four SEATS but only two players, and teams are pairs of opposite seats.
  // Pairing on the seat count would hand both opponents the same teamId — making them each other's
  // teammate, and the game unwinnable, since a team only places once its whole pair is home.
  @Test
  void theTwoPlayers_areNotMadeTeammates_whenTeamPlayIsAlsoOn() {
    // GIVEN both options on: team play, and two players spread over four seats
    gameState.setTeamPlay(true);
    gameState.setTwoPlayersOnFourSeats(true);
    gameState.addPlayer(new Player("A", "Ann"));
    gameState.addPlayer(new Player("B", "Bob"));

    // WHEN the game starts
    gameState.start(false);

    // THEN team play is off — two people cannot make a pair AND have anyone to play against — so
    // the pair of them stay opponents, and every downstream check reverts to individual play
    assertFalse(gameState.isTeamPlay());
    assertNull(seatById("A").getTeamId());
    assertNull(seatById("B").getTeamId());
  }

  /** The seat that owns a section, by its id. */
  private Player seatById(String seatId) {
    return gameState.getPlayers().stream()
        .filter(p -> p.getId().equals(seatId))
        .findFirst()
        .orElseThrow();
  }
}
