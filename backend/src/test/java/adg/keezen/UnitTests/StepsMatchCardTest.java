package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.INVALID_SELECTION;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnMove;
import adg.processing.ProcessOnSplit;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The number of steps a move request asks for has to be the card's: the server must not take the
 * client's word for it. Our own client always sends the right number, so only a request written by
 * hand can get this wrong — and the server is what stops it.
 */
class StepsMatchCardTest {

  private MoveRequest moveMessage;
  private MoveResponse moveResponse;
  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();
    createGame_With_NPlayers(gameState, 8);
    moveMessage = new MoveRequest();
    moveResponse = new MoveResponse();
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
    cardsDeck.reset();
  }

  @Test
  void aTwoPlayedAsTwelveSteps_IsRefused() {
    // GIVEN a pawn on the board and a two in hand
    Card two = givePlayerCard(cardsDeck, 0, 2);
    Pawn pawn = placePawnOnNest(gameState, "0", new PositionKey("0", 3));

    // WHEN the request asks for twelve steps with it
    createMoveRequest(moveMessage, pawn, two);
    moveMessage.setStepsPawn1(12);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN it is refused, and the pawn has not budged
    assertEquals(INVALID_SELECTION, moveResponse.getResult());
    assertEquals(MoveRejectionReason.INVALID_SELECTION, moveResponse.getRejectionReason());
    assertEquals(new PositionKey("0", 3), gameState.getPawn(pawn).getCurrentTileId());
  }

  /**
   * A Jack switches two pawns and a King brings one onto the board; neither walks the board. So
   * even asking for the card's own value in steps — what passes for every other card — is refused.
   */
  @ParameterizedTest(name = "card {0}")
  @ValueSource(ints = {11, 13})
  void aJackOrKingPlayedAsANormalMove_IsRefused(int jackOrKing) {
    // GIVEN a pawn on the board and a Jack or King in hand
    Card card = givePlayerCard(cardsDeck, 0, jackOrKing);
    Pawn pawn = placePawnOnNest(gameState, "0", new PositionKey("0", 1));

    // WHEN the request walks the pawn the card's value in steps
    createMoveRequest(moveMessage, pawn, card);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN it is refused, and the pawn has not budged
    assertEquals(INVALID_SELECTION, moveResponse.getResult());
    assertEquals(MoveRejectionReason.INVALID_SELECTION, moveResponse.getRejectionReason());
    assertEquals(new PositionKey("0", 1), gameState.getPawn(pawn).getCurrentTileId());
  }

  /** The halves add up to 7, but a split walks both pawns forwards: a negative half is refused. */
  @Test
  void aSplitOfEightAndMinusOne_IsRefused() {
    // GIVEN two pawns on the board and a seven in hand
    Card seven = givePlayerCard(cardsDeck, 0, 7);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 1));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 9));

    // WHEN the request splits it as 8 steps forwards and 1 back
    createSplitMessage(moveMessage, pawn1, 8, pawn2, -1, seven);
    ProcessOnSplit.process(gameState, moveMessage, moveResponse);

    // THEN it is refused, and neither pawn has budged
    assertEquals(INVALID_SELECTION, moveResponse.getResult());
    assertEquals(MoveRejectionReason.INVALID_SELECTION, moveResponse.getRejectionReason());
    assertEquals(new PositionKey("0", 1), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 9), gameState.getPawn(pawn2).getCurrentTileId());
  }

  /**
   * 0 + 7 is a useless split, but a valid one: it is the split's starting point, and it lets the
   * player go between splitting and one pawn walking all 7 without deselecting a pawn.
   */
  @Test
  void aSplitOfZeroAndSeven_IsAllowed() {
    // GIVEN two pawns on the board and a seven in hand
    Card seven = givePlayerCard(cardsDeck, 0, 7);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 1));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 3));

    // WHEN the request splits it as 0 steps for the first pawn and 7 for the second
    createSplitMessage(moveMessage, pawn1, 0, pawn2, 7, seven);
    ProcessOnSplit.process(gameState, moveMessage, moveResponse);

    // THEN it is made: the first pawn stays put, the second walks all 7
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("0", 1), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 10), gameState.getPawn(pawn2).getCurrentTileId());
  }

  /** A request that leaves the steps out is refused, rather than failing on the missing number. */
  @Test
  void aMoveWithoutSteps_IsRefused() {
    // GIVEN a pawn on the board and a five in hand
    Card five = givePlayerCard(cardsDeck, 0, 5);
    Pawn pawn = placePawnOnNest(gameState, "0", new PositionKey("0", 3));

    // WHEN the request says nothing about how far to walk
    createMoveRequest(moveMessage, pawn, five);
    moveMessage.setStepsPawn1(null);
    ProcessOnMove.process(gameState, moveMessage, moveResponse);

    // THEN it is refused, and the pawn has not budged
    assertEquals(INVALID_SELECTION, moveResponse.getResult());
    assertEquals(MoveRejectionReason.INVALID_SELECTION, moveResponse.getRejectionReason());
    assertEquals(new PositionKey("0", 3), gameState.getPawn(pawn).getCurrentTileId());
  }

  /** A split that leaves out how far one of its pawns walks is refused, rather than failing. */
  @Test
  void aSplitWithoutStepsForOnePawn_IsRefused() {
    // GIVEN two pawns on the board and a seven in hand
    Card seven = givePlayerCard(cardsDeck, 0, 7);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 1));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 9));

    // WHEN the request gives the first pawn all 7 steps and the second none at all
    createSplitMessage(moveMessage, pawn1, 7, pawn2, null, seven);
    ProcessOnSplit.process(gameState, moveMessage, moveResponse);

    // THEN it is refused, and neither pawn has budged
    assertEquals(INVALID_SELECTION, moveResponse.getResult());
    assertEquals(MoveRejectionReason.INVALID_SELECTION, moveResponse.getRejectionReason());
    assertEquals(new PositionKey("0", 1), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 9), gameState.getPawn(pawn2).getCurrentTileId());
  }

  /** The same for the first pawn: a split that leaves out its steps is refused, too. */
  @Test
  void aSplitWithoutStepsForTheFirstPawn_IsRefused() {
    // GIVEN two pawns on the board and a seven in hand
    Card seven = givePlayerCard(cardsDeck, 0, 7);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 1));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 9));

    // WHEN the request gives the second pawn all 7 steps and the first none at all
    createSplitMessage(moveMessage, pawn1, 0, pawn2, 7, seven);
    moveMessage.setStepsPawn1(null);
    ProcessOnSplit.process(gameState, moveMessage, moveResponse);

    // THEN it is refused, and neither pawn has budged
    assertEquals(INVALID_SELECTION, moveResponse.getResult());
    assertEquals(MoveRejectionReason.INVALID_SELECTION, moveResponse.getRejectionReason());
    assertEquals(new PositionKey("0", 1), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 9), gameState.getPawn(pawn2).getCurrentTileId());
  }
}
