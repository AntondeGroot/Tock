package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static org.junit.jupiter.api.Assertions.assertEquals;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnBoard;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import com.adg.openapi.model.TempMessageType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class CheckingOnBoardTest {

  MoveRequest moveMessage = new MoveRequest();
  MoveResponse moveResponse = new MoveResponse();

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
    moveMessage = null;
    moveResponse = null;
    cardsDeck.reset();
  }

  @Test
  void checkOnBoard_DoesNotRemoveCardFromHand() {
    // GIVEN
    Card card = givePlayerAce(cardsDeck, 0);
    int nrCards = cardsDeck.getCardsForPlayer("0").size();
    Pawn pawn1 =
        new Pawn().playerId("0").pawnId(new PawnId("0", 1)).currentTileId(new PositionKey("0", -1));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    moveMessage.setTempMessageType(TempMessageType.CHECK_MOVE);
    ProcessOnBoard.process(gameState, moveMessage, moveResponse);

    // THEN response message is correct
    assertEquals(nrCards, cardsDeck.getCardsForPlayer("0").size());
  }

  @Test
  void checkOnBoard_WrongCard_DoesNotShow() {
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 3);
    Pawn pawn1 =
        new Pawn().playerId("0").pawnId(new PawnId("0", 1)).currentTileId(new PositionKey("0", -1));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    moveMessage.setTempMessageType(TempMessageType.CHECK_MOVE);
    ProcessOnBoard.process(gameState, moveMessage, moveResponse);

    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
  }
}
