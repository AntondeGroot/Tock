package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.createGame_With_NPlayers;
import static adg.keezen.UnitTests.GameStateUtil.givePlayerSeven;
import static adg.keezen.UnitTests.GameStateUtil.placePawnOnBoard;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.SevenSplitRecommender;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SevenSplitRecommenderTest {

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();
    createGame_With_NPlayers(gameState, 8); // player 0's finish is reached from its own section
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
    cardsDeck.reset();
  }

  private MoveRequest baseRequest(Pawn pawn1, Pawn pawn2, Card card) {
    MoveRequest req = new MoveRequest();
    req.setPlayerId("0");
    req.setPawn1Id(pawn1.getPawnId());
    req.setPawn2Id(pawn2.getPawnId());
    req.setCardId(card.getUuid());
    return req;
  }

  @Test
  void recommendsStepsThatPutPawn1DeepestInFinish() {
    // pawn1 sits on the first finish tile (16); 3 steps lands it on the deepest tile (19).
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 16));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 5));

    int[] rec = SevenSplitRecommender.recommend(gameState, baseRequest(pawn1, pawn2, card));

    // pawn1 takes 3 (16 -> 19), pawn2 takes the remaining 4. Order is preserved.
    assertArrayEquals(new int[] {3, 4}, rec);
  }

  @Test
  void whenTheFinishPawnIsPawn2_allocationFavoursItWithoutSwappingOrder() {
    // The finish-capable pawn is the second-selected one. Pawn order must NOT be swapped — only
    // the allocation changes, giving pawn2 the 3 steps it needs to reach tile 19.
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 5));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 16));

    int[] rec = SevenSplitRecommender.recommend(gameState, baseRequest(pawn1, pawn2, card));

    // pawn1 keeps moving first with 4 steps; pawn2 takes 3 (16 -> 19).
    assertArrayEquals(new int[] {4, 3}, rec);
  }

  @Test
  void whenBothPawnsReachFinish_theDeeperReachingPawnGetsItsSteps() {
    // Both pawns are on player 0's approach (section 7). pawn1 at (7,10) can only reach finish tile
    // 17; pawn2 at (7,13) can reach the deepest tile 19 in 6 steps. The deeper pawn (pawn2) wins the
    // allocation, order unchanged.
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("7", 10));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("7", 13));

    int[] rec = SevenSplitRecommender.recommend(gameState, baseRequest(pawn1, pawn2, card));

    assertArrayEquals(new int[] {1, 6}, rec); // pawn2 takes 6 (→19); pawn1 the remaining 1
  }

  @Test
  void whenBothPawnsReachFinish_pawn1DeeperKeepsItsAllocation() {
    // Mirror of the above: pawn1 at (7,13) reaches the deepest tile 19; pawn2 at (7,10) only reaches
    // 17. The deeper pawn (pawn1) keeps its 6-step allocation; pawn2 takes the remaining 1.
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("7", 13));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("7", 10));

    int[] rec = SevenSplitRecommender.recommend(gameState, baseRequest(pawn1, pawn2, card));

    assertArrayEquals(new int[] {6, 1}, rec); // pawn1 takes 6 (→19); pawn2 the remaining 1
  }

  @Test
  void noRecommendationWhenNeitherPawnCanReachTheFinish() {
    // Both pawns are far from the finish; no allocation lands a pawn in the finish.
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 2));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 8));

    int[] rec = SevenSplitRecommender.recommend(gameState, baseRequest(pawn1, pawn2, card));

    assertNull(rec); // client keeps its 0/7 default
  }

  @Test
  void blockadeStopsPawn1_advancesItRightUpToTheBlockade() {
    // player1 has a pawn on its own start tile (1,0) — a blockade. player0's pawn1 at (0,11) can
    // advance to (0,15) (4 steps) but a 5th step would hit the blockade and bounce.
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 11));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 2));
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 0)); // blockade

    int[] rec = SevenSplitRecommender.recommend(gameState, baseRequest(pawn1, pawn2, card));

    // pawn1 advances the maximum 4 steps up to the blockade; pawn2 takes the remaining 3.
    assertArrayEquals(new int[] {4, 3}, rec);
  }

  @Test
  void blockadeStopsPawn2_advancesItWithoutSwappingOrder() {
    // Mirror: the blocked pawn is the second-selected one. Order is preserved; only the allocation
    // changes so pawn2 gets the 4 steps up to the blockade.
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 2));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 11));
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 0)); // blockade

    int[] rec = SevenSplitRecommender.recommend(gameState, baseRequest(pawn1, pawn2, card));

    assertArrayEquals(new int[] {3, 4}, rec);
  }

  @Test
  void finishWinsOverBlockade() {
    // pawn1 is blocked by a blockade (could advance 4), pawn2 can reach the finish. Finish wins:
    // pawn2 gets the 3 steps to land on tile 19, pawn1 takes the remaining 4.
    Card card = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 11));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 16));
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 0)); // blockade ahead of pawn1

    int[] rec = SevenSplitRecommender.recommend(gameState, baseRequest(pawn1, pawn2, card));

    assertArrayEquals(new int[] {4, 3}, rec);
  }
}
