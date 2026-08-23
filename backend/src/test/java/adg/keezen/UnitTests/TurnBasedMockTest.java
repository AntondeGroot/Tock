package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.createGame_With_NPlayers;
import static adg.keezen.UnitTests.GameStateUtil.createSplitMessage;
import static adg.keezen.UnitTests.GameStateUtil.place4PawnsOnFinish;
import static adg.keezen.UnitTests.GameStateUtil.placePawnOnBoard;
import static adg.keezen.UnitTests.GameStateUtil.playRemainingCards;
import static adg.keezen.UnitTests.GameStateUtil.sendForfeitMessage;
import static adg.keezen.UnitTests.GameStateUtil.sendValidMoveRequest;
import static adg.keezen.UnitTests.GameStateUtil.stringsToList;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static org.junit.Assert.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

import adg.keezen.CardsDeckInterface;
import adg.keezen.CardsDeckMock;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnMove;
import adg.processing.ProcessOnSplit;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.MoveResult;
import com.adg.openapi.model.MoveType;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import com.adg.openapi.model.TempMessageType;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Random;
import org.junit.Assert;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class TurnBasedMockTest {

  MoveRequest moveMessage = new MoveRequest();
  MoveResponse moveResponse = new MoveResponse();
  final ArrayList<String> activePlayers = new ArrayList<>();
  HashMap<String, Integer> nrCardsPerPlayer = new HashMap<>();

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession(new CardsDeckMock());
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();

    createGame_With_NPlayers(gameState, 3);
    moveMessage = new MoveRequest();
    moveResponse = new MoveResponse();
    activePlayers.add("0");
    activePlayers.add("1");
    activePlayers.add("2");
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
    moveMessage = null;
    moveResponse = null;
    activePlayers.clear();
    cardsDeck.reset();
    nrCardsPerPlayer = new HashMap<>();
    gameState.stop();
  }

  @Test
  void player1Forfeits_OtherPlayersStillActive() {
    // WHEN
    sendForfeitMessage(gameState, "0");

    // THEN
    activePlayers.remove("0");
    Assertions.assertEquals(activePlayers, gameState.getActivePlayers());
    Assertions.assertEquals(2, gameState.getActivePlayers().size());
  }

  @Test
  void player1Forfeits_Player1NoCards_OthersStillHaveCards() {
    // WHEN
    sendForfeitMessage(gameState, "0");

    // THEN
    HashMap<String, Integer> nrCardsPerPlayer = new HashMap<>();
    nrCardsPerPlayer.put("0", 0);
    nrCardsPerPlayer.put("1", 13);
    nrCardsPerPlayer.put("2", 13);
    assertEquals(nrCardsPerPlayer, cardsDeck.getNrOfCardsPerPlayer());
  }

  @Test
  void player1Forfeits_Player2IsNowPlaying() {
    // WHEN
    sendForfeitMessage(gameState, "0");

    // THEN
    activePlayers.remove("0");
    assertEquals("1", gameState.getPlayerIdTurn());
    assertEquals(activePlayers, gameState.getActivePlayers());
  }

  @Test
  void player1PlaysCard_13_13_13_CardsInTheGame() {
    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "0");

    // THEN
    HashMap<String, Integer> nrCardsPerPlayer = new HashMap<>();
    nrCardsPerPlayer.put("0", 13);
    nrCardsPerPlayer.put("1", 13);
    nrCardsPerPlayer.put("2", 13);
    assertEquals(nrCardsPerPlayer, cardsDeck.getNrOfCardsPerPlayer());
  }

  @Test
  void player1Forfeits_Player1GetsSkippedInNextTurn() {
    // GIVEN
    sendForfeitMessage(gameState, "0");
    sendValidMoveRequest(gameState, cardsDeck, "1");

    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "2");

    // THEN
    assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void allPlayersForfeit_AllPlayersActiveAgain() {
    // WHEN
    sendForfeitMessage(gameState, "0");
    sendForfeitMessage(gameState, "1");
    sendForfeitMessage(gameState, "2");

    // THEN
    Assert.assertEquals(activePlayers, gameState.getActivePlayers());
    Assert.assertEquals(3, gameState.getActivePlayers().size());
  }

  @Test
  void allPlayersForfeit_AllPlayersHave13Cards() {
    // WHEN
    sendForfeitMessage(gameState, "0");
    sendForfeitMessage(gameState, "1");
    sendForfeitMessage(gameState, "2");

    // THEN
    HashMap<String, Integer> nrCardsPerPlayer = new HashMap<>();
    nrCardsPerPlayer.put("0", 13);
    nrCardsPerPlayer.put("1", 13);
    nrCardsPerPlayer.put("2", 13);
    assertEquals(nrCardsPerPlayer, cardsDeck.getNrOfCardsPerPlayer());
  }

  @Test
  void allPlayersForfeit2Rounds_AllPlayersHave13Cards() {
    // WHEN
    for (int i = 0; i < 2; i++) {
      sendForfeitMessage(gameState, "0");
      sendForfeitMessage(gameState, "1");
      sendForfeitMessage(gameState, "2");
    }

    // THEN
    HashMap<String, Integer> nrCardsPerPlayer = new HashMap<>();
    nrCardsPerPlayer.put("0", 13);
    nrCardsPerPlayer.put("1", 13);
    nrCardsPerPlayer.put("2", 13);
    assertEquals(nrCardsPerPlayer, cardsDeck.getNrOfCardsPerPlayer());
  }

  @Test
  void allPlayersForfeit3Rounds_AllPlayersHave13Cards() {
    // WHEN
    for (int i = 0; i < 3; i++) {
      sendForfeitMessage(gameState, "0");
      sendForfeitMessage(gameState, "1");
      sendForfeitMessage(gameState, "2");
    }

    // THEN
    HashMap<String, Integer> nrCardsPerPlayer = new HashMap<>();
    nrCardsPerPlayer.put("0", 13);
    nrCardsPerPlayer.put("1", 13);
    nrCardsPerPlayer.put("2", 13);
    assertEquals(nrCardsPerPlayer, cardsDeck.getNrOfCardsPerPlayer());
  }

  @Test
  void player2Forfeits_WhenPlayer1HasPlayed_Player3WillPlayNext() {
    // GIVEN
    sendValidMoveRequest(gameState, cardsDeck, "0");
    sendForfeitMessage(gameState, "1");
    sendValidMoveRequest(gameState, cardsDeck, "2");

    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "0");

    // THEN
    assertTrue(cardsDeck.getCardsForPlayer("1").isEmpty());
    assertEquals("2", gameState.getPlayerIdTurn());
  }

  @Test
  void allPlayersExcept1Forfeit_RemainingPlayerCanKeepPlayingIndefinitely() {
    // GIVEN
    sendForfeitMessage(gameState, "0");
    sendForfeitMessage(gameState, "1");

    for (int i = 0; i < 13; i++) {
      // WHEN
      sendValidMoveRequest(gameState, cardsDeck, "2");

      // THEN
      Assert.assertEquals("playerId turn NOT last round", "2", gameState.getPlayerIdTurn());
      Assert.assertEquals(
          "cards remaining for player 2", 13, cardsDeck.getCardsForPlayer("2").size());
    }
  }

  @Test
  void playerCanOnlyMoveHisOwnPawn() {

    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "0");

    // send a valid move for the wrong player
    Pawn pawn =
        new Pawn().playerId("0").pawnId(new PawnId("0", 0)).currentTileId(new PositionKey("0", 6));

    // a valid card that both players will have since they have all 13 cards
    Card card = new Card().suit(0).value(5).uuid(new Random().nextInt());
    cardsDeck.giveCardToPlayerForTesting("1", card);

    // send move message
    MoveRequest moveMessage = new MoveRequest();
    moveMessage.setPlayerId("1");
    moveMessage.setPawn1Id(pawn.getPawnId());
    moveMessage.setMoveType(MoveType.MOVE);
    moveMessage.setStepsPawn1(card.getValue());
    moveMessage.setCardId(card.getUuid());
    moveMessage.setTempMessageType(TempMessageType.MAKE_MOVE);

    // process
    MoveResponse moveResponse = new MoveResponse();
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN
    assertTrue(moveResponse.getMovePawn1().isEmpty());
    assertEquals(MoveResult.CANNOT_MAKE_MOVE, moveResponse.getResult());
  }

  @Test
  void playersPlayAllTheirCards_ExceptLastPlayer_AllPlayersAreStillActive() {
    // GIVEN
    for (int i = 0; i < 4; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "0");
      sendValidMoveRequest(gameState, cardsDeck, "1");
      sendValidMoveRequest(gameState, cardsDeck, "2");
    }

    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "0");
    sendValidMoveRequest(gameState, cardsDeck, "1");

    // THEN
    assertEquals(stringsToList(new String[] {"0", "1", "2"}), gameState.getActivePlayers());
  }

  @Test
  void players0and2Finished_OnlyPlayer1PlayingAndForfeiting_DoesNotSwitchToWinner() {
    // GIVEN
    ArrayList<String> winners = new ArrayList<>();
    place4PawnsOnFinish(gameState, "0");
    gameState.checkForWinners(winners);
    place4PawnsOnFinish(gameState, "2");
    gameState.checkForWinners(winners);

    // WHEN
    sendForfeitMessage(gameState, "0");
    playRemainingCards(gameState, cardsDeck, "1");
    sendForfeitMessage(gameState, "2");

    // THEN
    assertEquals("1", gameState.getPlayerIdTurn());
    sendForfeitMessage(gameState, "1");
    assertEquals("1", gameState.getPlayerIdTurn());
    sendForfeitMessage(gameState, "1");
    assertEquals("1", gameState.getPlayerIdTurn());
    sendForfeitMessage(gameState, "1");
    assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void players1Starts_WhenPlayer1PlaysLastCard_Player2ShouldPlay_Bugfix() {
    // GIVEN
    gameState.setPlayerIdTurn("1");
    for (int i = 0; i < 4; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "1");
      sendValidMoveRequest(gameState, cardsDeck, "2");
      sendValidMoveRequest(gameState, cardsDeck, "0");
    }

    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "1");

    // THEN
    Assertions.assertEquals("2", gameState.getPlayerIdTurn());
  }

  @Test
  void players2Starts_WhenPlayer2PlaysLastCard_Player0ShouldPlay_Bugfix() {
    // GIVEN
    gameState.setPlayerIdTurn("2");
    for (int i = 0; i < 4; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "2");
      sendValidMoveRequest(gameState, cardsDeck, "0");
      sendValidMoveRequest(gameState, cardsDeck, "1");
    }

    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "2");

    // THEN
    Assertions.assertEquals("0", gameState.getPlayerIdTurn());
  }

  @Test
  void players2Starts_WhenPlayer2PlaysLastCard_AndPlayer0Forfeits_Player1ShouldPlay() {
    // GIVEN
    gameState.setPlayerIdTurn("2");
    for (int i = 0; i < 4; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "2");
      sendValidMoveRequest(gameState, cardsDeck, "0");
      sendValidMoveRequest(gameState, cardsDeck, "1");
    }

    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "2");
    sendForfeitMessage(gameState, "0");

    // THEN
    Assertions.assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void players0Starts_WhenPlayer0and2Forfeit_Player1PlaysLastCard_Player1ShouldPlay_bugfix() {
    // GIVEN
    gameState.setPlayerIdTurn("0");
    sendForfeitMessage(gameState, "0");
    sendValidMoveRequest(gameState, cardsDeck, "1");
    sendForfeitMessage(gameState, "2");

    for (int i = 0; i < 3; i++) {
      sendValidMoveRequest(gameState, cardsDeck, "1");
    }

    // WHEN send last card
    sendValidMoveRequest(gameState, cardsDeck, "1");

    // THEN
    Assertions.assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void oneRound_player0LastPlayer_nextPlayer1() {
    // GIVEN
    createGame_With_NPlayers(gameState, 3);

    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "0");
    gameState.forfeitPlayer("1");
    gameState.forfeitPlayer("2");
    playRemainingCards(gameState, cardsDeck, "0");
    gameState.forfeitPlayer("0");

    // THEN
    assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void oneRound_player1LastPlayer_nextPlayer1() {
    // GIVEN
    createGame_With_NPlayers(gameState, 3);

    // WHEN
    sendValidMoveRequest(gameState, cardsDeck, "0");
    sendValidMoveRequest(gameState, cardsDeck, "1");
    gameState.forfeitPlayer("2");
    gameState.forfeitPlayer("0");
    playRemainingCards(gameState, cardsDeck, "1");

    // THEN
    assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void oneRound_player2LastPlayer_nextPlayer1_Forfeit() {
    // GIVEN
    createGame_With_NPlayers(gameState, 3);

    // WHEN
    gameState.forfeitPlayer("0");
    gameState.forfeitPlayer("1");
    gameState.forfeitPlayer("2");

    // THEN
    assertEquals("1", gameState.getPlayerIdTurn());
  }

  @Test
  void twoRoundsPlayed_nextPlayer2() {
    // GIVEN
    createGame_With_NPlayers(gameState, 3);

    // WHEN round 1
    gameState.forfeitPlayer("0");
    gameState.forfeitPlayer("1");
    gameState.forfeitPlayer("2");
    // WHEN round 2
    gameState.forfeitPlayer("1");
    gameState.forfeitPlayer("2");
    gameState.forfeitPlayer("0");

    // THEN
    assertEquals("2", gameState.getPlayerIdTurn());
  }

  @Test
  void twoRounds_player2LastPlayer_nextPlayer2() {
    // GIVEN
    createGame_With_NPlayers(gameState, 3);

    // WHEN round 1
    gameState.forfeitPlayer("0");
    gameState.forfeitPlayer("1");
    gameState.forfeitPlayer("2");
    // WHEN round 2
    gameState.forfeitPlayer("1");
    sendValidMoveRequest(gameState, cardsDeck, "2");
    gameState.forfeitPlayer("0");
    playRemainingCards(gameState, cardsDeck, "2");
    // THEN
    assertEquals("2", gameState.getPlayerIdTurn());
  }

  @Test
  void threeRounds_player0LastPlayer_nextPlayer0() {
    // GIVEN
    createGame_With_NPlayers(gameState, 3);

    // WHEN round 1
    gameState.forfeitPlayer("0");
    gameState.forfeitPlayer("1");
    gameState.forfeitPlayer("2");
    // WHEN round 2
    gameState.forfeitPlayer("1");
    gameState.forfeitPlayer("2");
    gameState.forfeitPlayer("0");
    // WHEN round 3
    gameState.forfeitPlayer("2");
    sendValidMoveRequest(gameState, cardsDeck, "0");
    gameState.forfeitPlayer("1");
    playRemainingCards(gameState, cardsDeck, "0");

    // THEN
    assertEquals("0", gameState.getPlayerIdTurn());
  }

  @Test
  void threeRoundsPlayed_nextPlayer0() {
    // GIVEN
    createGame_With_NPlayers(gameState, 3);

    // WHEN round 1
    gameState.forfeitPlayer("0");
    gameState.forfeitPlayer("1");
    gameState.forfeitPlayer("2");
    // WHEN round 2
    gameState.forfeitPlayer("1");
    gameState.forfeitPlayer("2");
    gameState.forfeitPlayer("0");
    // WHEN round 3
    gameState.forfeitPlayer("2");
    gameState.forfeitPlayer("0");
    gameState.forfeitPlayer("1");

    // THEN
    assertEquals("0", gameState.getPlayerIdTurn());
  }

  @Test
  void test_whenSplitIsPlayed_nextPlayerIs() {
    /// GIVEN
    createGame_With_NPlayers(gameState, 3);
    // send a valid move for the wrong player
    Pawn pawn1 =
        new Pawn().playerId("0").pawnId(new PawnId("0", 1)).currentTileId(new PositionKey("0", 6));
    Pawn pawn2 =
        new Pawn().playerId("0").pawnId(new PawnId("0", 2)).currentTileId(new PositionKey("0", 0));
    placePawnOnBoard(gameState, pawn1);
    placePawnOnBoard(gameState, pawn2);
    // fake a valid card
    Card card = new Card().suit(0).value(7).uuid(new Random().nextInt());
    // replace a card from the players hand with this card
    cardsDeck.giveCardToPlayerForTesting("0", card);

    createSplitMessage(moveMessage, pawn1, 3, pawn2, 4, card);
    // process
    MoveResponse moveResponse = new MoveResponse();
    ProcessOnSplit.process(gameState, moveMessage, moveResponse);

    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals("1", gameState.getPlayerIdTurn());
  }
}
