package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.INVALID_SELECTION;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnMove;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PositionKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

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
}
