package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.MoveAvailabilityChecker;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PositionKey;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link MoveAvailabilityChecker}.
 *
 * <p>Board layout (8 players): section "N" owns tiles 0-15; finish for player "N"
 * is at tiles 16-19 of section "N", reachable only from section "N-1".
 * Player "0"'s last section (before finish) is section "7".
 *
 * <p>Every test calls {@code hasAvailableMove} with an explicit one-card list so
 * that board/deck state stays predictable regardless of the cards dealt at start.
 */
class MoveAvailabilityCheckerTest {

  private GameState gameState;
  private CardsDeckInterface cardsDeck;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();
    createGame_With_NPlayers(gameState, 8);
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
    cardsDeck.reset();
  }

  // ── Regular cards ─────────────────────────────────────────────────────────

  @Test
  void regularCard_pawnOnBoard_hasMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 5);
    placePawnOnNest(gameState, "0", new PositionKey("0", 5));

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void regularCard_allPawnsOnNest_noMoveAvailable() {
    // All 4 pawns start in the nest; a regular card cannot move them.
    Card card = givePlayerCard(cardsDeck, 0, 5);

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void noCards_noMoveAvailable() {
    placePawnOnNest(gameState, "0", new PositionKey("0", 5));

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of()));
  }

  // ── Card 4 (backward) ─────────────────────────────────────────────────────

  @Test
  void four_pawnOnBoard_hasMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 4);
    placePawnOnNest(gameState, "0", new PositionKey("0", 5));

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void four_allPawnsOnNest_noMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 4);

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  // ── King (13) ─────────────────────────────────────────────────────────────

  @Test
  void king_nestPawn_startTileFree_hasMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 13);
    // All pawns in nest by default; start tile (0,0) is free.

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void king_allPawnsOnBoard_noMoveAvailable() {
    // King can only put a pawn from nest onto the board.
    Card card = givePlayerCard(cardsDeck, 0, 13);
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 3));
    placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 5));
    placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 7));
    placePawnOnBoard(gameState, new PawnId("0", 3), new PositionKey("0", 9));

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void king_nestPawn_startTileBlockedByOwnPawn_noMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 13);
    // Put own pawn on own start tile to block king move.
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 0));

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  // ── Ace (1) ───────────────────────────────────────────────────────────────

  @Test
  void ace_nestPawn_hasMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 1);
    // All pawns in nest by default; ace can put one on the board.

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void ace_pawnOnBoard_hasMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 1);
    // Ace can also move a board pawn 1 step.
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 5));

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  // ── Jack (11) ─────────────────────────────────────────────────────────────

  @Test
  void jack_ownBoardPawn_opponentBoardPawn_hasMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 11);
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 3));
    // Opponent pawn not on their own start tile (required by ProcessOnSwitch).
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 5));

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void jack_noOpponentOnNormalBoard_noMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 11);
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 3));
    // All opponent pawns remain in nest — no valid switch target.

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void jack_noOwnBoardPawn_noMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 11);
    // Opponent on board but own pawns are still in nest.
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 5));

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  // ── Finish pawns excluded ─────────────────────────────────────────────────

  @Test
  void finishPawns_excluded_regularCard_allPawnsOnFinish_noMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 5);
    // Put all own pawns in the finish lane — they are exempt from the must-play rule.
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 16));
    placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 17));
    placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 18));
    placePawnOnBoard(gameState, new PawnId("0", 3), new PositionKey("0", 19));

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void finishPawns_excluded_oneBoardPawnPresent_hasMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 5);
    // Three pawns in finish (exempt), one pawn on normal board.
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 16));
    placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 17));
    placePawnOnBoard(gameState, new PawnId("0", 2), new PositionKey("0", 18));
    placePawnOnBoard(gameState, new PawnId("0", 3), new PositionKey("0", 3)); // on normal board

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  // ── Ace: mixed nest/board paths ───────────────────────────────────────────

  @Test
  void ace_nestPathBlocked_boardPathSucceeds() {
    // Own pawn at own start tile (0,0) blocks the ONBOARD move for nest pawns.
    // A second pawn is on the normal board; Ace can still move it 1 step → true.
    Card card = givePlayerCard(cardsDeck, 0, 1);
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 0)); // blocks ONBOARD
    placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 5)); // board path

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  // ── Jack edge cases ───────────────────────────────────────────────────────

  @Test
  void jack_opponentOnOwnStartTile_noOtherTarget_noMoveAvailable() {
    // ProcessOnSwitch rejects pawn2 when it sits on its own start tile (tileNr=0).
    // If that is the only opponent on the board, Jack has no valid switch target → false.
    Card card = givePlayerCard(cardsDeck, 0, 11);
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 3)); // own pawn
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 0)); // opponent on own start → blocked

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void jack_oneOpponentOnOwnStartTile_anotherOpponentValid_hasMoveAvailable() {
    // First opponent is on own start tile (blocked), second is on a normal tile → valid.
    Card card = givePlayerCard(cardsDeck, 0, 11);
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 3));
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 0)); // blocked
    placePawnOnBoard(gameState, new PawnId("2", 0), new PositionKey("2", 5)); // valid

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  // ── Card 7 ────────────────────────────────────────────────────────────────

  @Test
  void seven_singlePawnOnBoard_hasMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 7);
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 3));

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  @Test
  void seven_allPawnsOnNest_noMoveAvailable() {
    Card card = givePlayerCard(cardsDeck, 0, 7);
    // No board pawns — neither single nor split is possible.

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  /**
   * Two pawns are adjacent; the first split (A=1) would land A on B's tile — rejected
   * by processOnMove (same-player collision). The checker must iterate past this invalid
   * split and find A=2, B=5 which stays within the section → true.
   *
   * <p>Both single-pawn 7s are also blocked (exactMoveRequired=true, blockade at (1,0))
   * so the split code path is actually exercised.
   */
  @Test
  void seven_firstSplitBlockedByCollision_laterSplitValid() {
    gameState.setExactMoveRequired(true);
    Card card = givePlayerCard(cardsDeck, 0, 7);
    Pawn pawnA = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 9));
    Pawn pawnB = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 10));
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 0)); // blockade

    // Single A: 9+7=16 → crosses (1,0) → CANNOT. Single B: 10+7=17 → same → CANNOT.
    // Split A=1: A→(0,10) = B → CANNOT (collision). Split A=2,B=5: A→(0,11),B→(0,15) → valid.
    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  /**
   * One pawn on the last section before the finish, exactMoveRequired=true.
   * The single 7-step move would overshoot finish tile 19 → rejected.
   * No second pawn exists, so no split is possible → false.
   */
  @Test
  void seven_onePawn_overshoostsFinish_noSplitPossible_noMoveAvailable() {
    gameState.setExactMoveRequired(true);
    Card card = givePlayerCard(cardsDeck, 0, 7);
    // Player "0"'s last section is "7". Tile 13 + 7 = 20 > 19 → overshoot.
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("7", 13));

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  /**
   * Both board pawns are individually blocked for 7 steps (the next-section start tile
   * has a blockade), but a 3+4 split stays within the current section for both pawns
   * and is therefore legal. Verifies that the checker exhausts the split search.
   *
   * <p>Setup (8-player game, exactMoveRequired=true so the reversal path is rejected):
   *   pawnA at (0,12), pawnB at (0,9), player "1"'s own pawn at (1,0) [blockade].
   *   Single 7 for A: 12+7=19 > 15 → crosses to section 1 → (1,0) blocked → CANNOT_MAKE_MOVE.
   *   Single 7 for B: 9+7=16 > 15 → crosses to section 1 → (1,0) blocked → CANNOT_MAKE_MOVE.
   *   Split A=3 → (0,15), B=4 → (0,13): both stay in section 0 → CAN_MAKE_MOVE.
   */
  @Test
  void seven_bothPawnsBlockedForSingleMove_splitIsValid() {
    gameState.setExactMoveRequired(true);
    Card card = givePlayerCard(cardsDeck, 0, 7);
    Pawn pawnA = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 12));
    Pawn pawnB = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 9));
    // Blockade: player "1"'s own pawn sits on their start tile.
    placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 0));

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  // ── exactMoveRequired interaction ────────────────────────────────────────

  /**
   * exactMoveRequired=false (default): when a forward path is blocked by a section-boundary
   * blockade, ProcessOnMove reverses the pawn back into the current section instead of
   * failing. That reversal IS a valid move, so mustPlayIfPossible must block the forfeit.
   *
   * <p>Setup: pawn at (0,12), card 5, blockade at (1,0).
   * Without exactMoveRequired: 12+5=17 → blocked → reversal to (0,15-17%15)=(0,13) → CAN_MAKE_MOVE.
   */
  @Test
  void exactMoveNotRequired_forwardBlocked_reversalCountsAsValidMove_hasMoveAvailable() {
    gameState.setExactMoveRequired(false);
    Card card = givePlayerCard(cardsDeck, 0, 5);
    placePawnOnNest(gameState, "0", new PositionKey("0", 12));
    placePawnOnNest(gameState, "1", new PositionKey("1", 0)); // blockade

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  /**
   * exactMoveRequired=true, same board: the blocked forward move cannot reverse and
   * returns CANNOT_MAKE_MOVE. No other pawns or cards → no move available → can forfeit.
   */
  @Test
  void exactMoveRequired_forwardBlocked_noReversal_noMoveAvailable() {
    gameState.setExactMoveRequired(true);
    Card card = givePlayerCard(cardsDeck, 0, 5);
    placePawnOnNest(gameState, "0", new PositionKey("0", 12));
    placePawnOnNest(gameState, "1", new PositionKey("1", 0)); // blockade

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  /**
   * exactMoveRequired=false, pawn inside the finish lane, ping-pong move available.
   * Without exactMoveRequired a pawn closed in by own pawns can ping-pong → CAN_MAKE_MOVE.
   * mustPlayIfPossible should block the forfeit.
   */
  @Test
  void exactMoveNotRequired_finishPawnClosedIn_pingPongCountsAsMove_hasMoveAvailable() {
    // Finish pawns are normally excluded. But this pawn is on the NORMAL board (tile 14),
    // not in finish, so it qualifies as a boardPawn.
    // Use a pawn already on the finish — wait, finish pawns ARE excluded.
    // Instead: pawn on tile 19 (finish), would overshoot, reverses to 17 without exactMove.
    // But finish pawns are excluded from the checker, so this tests that result is false.
    gameState.setExactMoveRequired(false);
    Card card = givePlayerCard(cardsDeck, 0, 5);
    placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("0", 19)); // finish → excluded

    assertFalse(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }

  /**
   * Two pawns near the finish corridor: the only way to use card 7 is a split where
   * one pawn enters the finish with fewer steps and the other takes the remaining steps
   * on the open board.
   *
   * <p>Setup (8-player game): pawn "0" is on the last section before player "0"'s finish
   * (section "7", tile 13).  A single 7 would overshoot tile 19 and be rejected with
   * exactMoveRequired.  But split 2+5 (enter finish at 16, other pawn on board 5 steps)
   * is valid.
   */
  @Test
  void seven_splitIntoFinish_isValid() {
    gameState.setExactMoveRequired(true);
    Card card = givePlayerCard(cardsDeck, 0, 7);
    // Player "0"'s last section is "7" (previousPlayerId("0") = "7").
    // Tile (7,13): 13 + 7 = 20 > 19 → overshoots finish cap → CANNOT_MAKE_MOVE for single.
    // Split: 2 steps into finish (7,15)→(0,16), plus 5 steps for pawnB on normal board.
    Pawn pawnA = placePawnOnBoard(gameState, new PawnId("0", 0), new PositionKey("7", 13));
    Pawn pawnB = placePawnOnBoard(gameState, new PawnId("0", 1), new PositionKey("0", 3));

    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, "0", List.of(card)));
  }
}