package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.createGame_With_NPlayers;
import static adg.keezen.UnitTests.GameStateUtil.createSplitMessage;
import static adg.keezen.UnitTests.GameStateUtil.givePlayerSeven;
import static adg.keezen.UnitTests.GameStateUtil.placePawnOnBoard;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.TempMessageType.CHECK_MOVE;
import static org.junit.jupiter.api.Assertions.assertEquals;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.ProcessOnSplit;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Checking a 7-split only answers whether it can be made: it never changes the board. */
class SevenSplitCheckTest {

  private static final int THREADS = 8;
  private static final int CHECKS_PER_THREAD = 2_000;

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setUp() {
    GameSession session = new GameSession();
    gameState = session.getGameState();
    cardsDeck = session.getCardsDeck();
    createGame_With_NPlayers(gameState, 4);
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
    cardsDeck.reset();
  }

  // While a 7 is being split, the client asks over and over whether the split can be made, and the
  // 7-split hint asks again for every way to divide the 7. Those checks must leave the board alone:
  // a check that moves a pawn, even for a moment, can be seen half-done by a check running beside
  // it — which then puts that pawn "back" on a tile it only borrowed, where nobody moved it.
  @Test
  void checkingASevenSplitFromManyThreadsAtOnce_neverMovesAPawn() throws Exception {
    // GIVEN player 0 holding a 7, with pawns on tiles 3 and 10
    Card seven = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 3));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 10));

    // WHEN a split of 4 and 3 is checked from many threads at once, many times over
    checkSimultaneously(() -> checkSplit(pawn1, pawn2, seven));

    // THEN both pawns are where they were
    assertEquals(new PositionKey("0", 3), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 10), gameState.getPawn(pawn2).getCurrentTileId());
  }

  // The second pawn is checked on the board as it will be once the first has moved. Only the first
  // pawn changes place there: every other pawn still stands where it stands, and still blocks.
  @Test
  void checkingASevenSplit_stillSeesTheOtherPawnsInTheSecondPawnsWay() {
    // GIVEN player 0 holding a 7, with pawns on tiles 3 and 10 — and a third of theirs on tile 13
    Card seven = givePlayerSeven(cardsDeck, 0);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 3));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 10));
    placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 13));

    // WHEN a split is checked that would put the second pawn on tile 13
    MoveResponse response = checkSplit(pawn1, pawn2, seven);

    // THEN it cannot be made: a pawn cannot land on one of its own
    assertEquals(CANNOT_MAKE_MOVE, response.getResult());
  }

  // When the first pawn lands on an opponent, the opponent is sent home and the first pawn takes
  // the tile. So that tile is the first pawn's for the second pawn's check: it holds one of the
  // player's own pawns now, not the opponent that is about to be gone. (The old check moved the
  // first pawn onto the opponent for real, leaving two pawns on one tile — and which of them it
  // saw depended on the order of the pawn list. Player 1 moves here, as player 0's pawns come first
  // in that list: it saw the opponent, and let the second pawn land on the first.)
  @Test
  void checkingASevenSplit_seesTheTileTheFirstPawnTakesFromAnOpponentAsItsOwn() {
    // GIVEN player 1 holding a 7, with pawns on tiles 3 and 4, and an opponent's pawn on tile 7
    Card seven = givePlayerSeven(cardsDeck, 1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 3));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 4));
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("1", 7));

    // WHEN a split is checked that sends the first pawn onto the opponent, and the second after it
    MoveResponse response = checkSplit(pawn1, pawn2, seven);

    // THEN it cannot be made: the second pawn would land on the first, not on the opponent
    assertEquals(CANNOT_MAKE_MOVE, response.getResult());
  }

  /** Checks a split of the 7: 4 steps for {@code pawn1}, 3 for {@code pawn2}. */
  private MoveResponse checkSplit(Pawn pawn1, Pawn pawn2, Card seven) {
    MoveRequest request = new MoveRequest();
    createSplitMessage(request, pawn1, 4, pawn2, 3, seven);
    request.setTempMessageType(CHECK_MOVE);
    MoveResponse response = new MoveResponse();
    ProcessOnSplit.process(gameState, request, response);
    return response;
  }

  /** Runs {@code check} CHECKS_PER_THREAD times on each of THREADS threads, all released at once. */
  private static void checkSimultaneously(Runnable check) throws Exception {
    ExecutorService threads = Executors.newFixedThreadPool(THREADS);
    CountDownLatch go = new CountDownLatch(1);
    List<Future<?>> running = new ArrayList<>();
    for (int t = 0; t < THREADS; t++) {
      running.add(threads.submit(() -> {
        go.await();
        for (int i = 0; i < CHECKS_PER_THREAD; i++) {
          check.run();
        }
        return null;
      }));
    }
    go.countDown();
    for (Future<?> thread : running) {
      thread.get(); // rethrows anything a check threw
    }
    threads.shutdown();
  }
}
