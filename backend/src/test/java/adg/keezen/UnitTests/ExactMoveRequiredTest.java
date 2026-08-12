package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.*;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
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

/**
 * Verifies that when exactMoveRequired=true, any move that would cause a
 * direction reversal is rejected with CANNOT_MAKE_MOVE. Covers all four
 * reversal sites in ProcessOnMove.
 *
 * <p>Board layout (8 players, playerInt = index):
 *   Section "0" tiles 0-15  →  "1" tiles 0-15  →  ... →  "7" tiles 0-15
 *   Player "1" finish tiles: (1,16)-(1,19)
 *   Last section before player "1"'s finish: section "0"
 */
class ExactMoveRequiredTest {

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
    gameState.setExactMoveRequired(true);
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

  // ── Case 1: forward move blocked by occupied start tile ───────────────────
  // Without exactMoveRequired: pawn hits the blockade and reverses backward.
  // With exactMoveRequired: CANNOT_MAKE_MOVE.

  @Test
  void forwardMove_BlockedByOccupiedStartTile_CannotMove() {
    // pawn at (0,15) + 2 steps → would cross into section 1, but (1,0) is blocked
    // → without setting: reverses to (0,13)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 2);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 15));
    Pawn blocker = placePawnOnNest(gameState, "1", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("0", 15), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void forwardMove_BlockedByOccupiedStartTile_LongerDistance_CannotMove() {
    // pawn at (0,14) + 5 steps → would cross into section 1, but (1,0) is blocked
    // → without setting: reverses to (0,11)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, 5);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("0", 14));
    Pawn blocker = placePawnOnNest(gameState, "1", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("0", 14), gameState.getPawn(pawn1).getCurrentTileId());
  }

  // ── Case 2: backward move blocked by occupied start tile ─────────────────
  // Without exactMoveRequired: pawn hits the blockade and reverses forward.
  // With exactMoveRequired: CANNOT_MAKE_MOVE.

  @Test
  void backwardMove_BlockedByOccupiedStartTile_CannotMove() {
    // pawn at (1,2) - 4 steps → wants to cross back through (1,0), but it is blocked
    // → without setting: reverses to (1,4)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 0, -4);
    Pawn pawn1 = placePawnOnNest(gameState, "0", new PositionKey("1", 2));
    Pawn blocker = placePawnOnNest(gameState, "1", new PositionKey("1", 0));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("1", 2), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void backwardMove_BlockedByOwnOccupiedStartTile_CannotMove() {
    // pawn at (0,3) - 5 steps → wants to cross through (0,0), but player0's own pawn blocks it
    // → without setting: reverses to (0,4)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -5);
    Pawn blocker = placePawnOnNest(gameState, "0", new PositionKey("0", 0));
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("0", 3));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("0", 3), gameState.getPawn(pawn1).getCurrentTileId());
  }

  // ── Case 3b: entering finish from last section, first tile blocked ────────
  // Without exactMoveRequired: pawn bounces off the blocked tile 16 and lands back on the
  // last section.
  // With exactMoveRequired: CANNOT_MAKE_MOVE.

  @Test
  void enteringFinish_FirstTileBlockedByOwnPawn_ExactEntry_CannotMove() {
    // pawn "1" at (0,15) + 1 step → tries to enter finish at (1,16) but it is occupied
    // → without setting: bounces back to (0,14)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("0", 15));
    Pawn blocker = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("0", 15), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void enteringFinish_FirstTileBlockedByOwnPawn_OvershootEntry_CannotMove() {
    // pawn "1" at (0,13) + 6 steps → would reach (1,19) but (1,16) is blocked
    // → without setting: bounces back to (0,11)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 6);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("0", 13));
    Pawn blocker = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("0", 13), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void enteringFinish_FirstTileBlockedByOwnPawn_OwnPawnOnSectionTile_CannotMove() {
    // pawn "1" at (0,14) + 2 steps → would enter (1,16) but it is blocked.
    // Another own pawn sits at (1,15) (player 1's main-board tile 15), which causes
    // checkHighestTileNrYouCanMoveTo to stop at 14 instead of reaching tile 16.
    // This makes highestReachable (14) == bounce target (14) → overshoot not detected
    // → without setting: pawn bounces back to (0,14) (its own starting tile)
    // → WITH setting: must be CANNOT_MAKE_MOVE
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 2);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("0", 14));
    Pawn blocker = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));
    Pawn sectionPawn = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 15));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("0", 14), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void enteringFinish_BounceReturnsToStartingTile_CannotMove() {
    // pawn "1" at (0,12) + 6 steps → 13, 14, 15, then (1,16) is blocked by an own pawn, so it
    // bounces and walks back 14, 13, 12 — landing on the very tile it started from.
    // → without setting: the pawn "moves" to (0,12); with the setting it must be refused, and the
    //   player told the exact step count that reaches the wall: 3, landing on (0,15).
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 6);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("0", 12));
    Pawn blocker = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(MoveRejectionReason.MUST_MOVE_EXACT_STEPS, moveResponse.getRejectionReason());
    assertEquals(3, moveResponse.getRejectionDetail());
    assertEquals(new PositionKey("0", 12), gameState.getPawn(pawn1).getCurrentTileId());
  }

  // ── Case 3: entering finish from last section, overshoots and would bounce ─
  // Without exactMoveRequired: pawn bounces off tile 19 and lands somewhere lower.
  // With exactMoveRequired: CANNOT_MAKE_MOVE.

  @Test
  void enteringFinish_Overshoots_CannotMove() {
    // pawn "1" at (0,14) + 8 steps → enters finish but overshoots tile 19
    // → without setting: bounces to (1,16)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 8);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("0", 14));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("0", 14), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void enteringFinish_ExactlyAtTile19_IsAllowed() {
    // sanity check: a move that lands exactly on tile 19 has no reversal → still allowed
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 5);
    Pawn pawn1 = placePawnOnNest(gameState, "1", new PositionKey("0", 14));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN — 14 + 5 = 19, no bounce
    assertNotEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("1", 19), gameState.getPawn(pawn1).getCurrentTileId());
  }

  // ── Case 4b: pawn already on finish, loosely closed in, but forward move is clean ──
  // When a pawn has an own pawn behind it (making it "loosely closed in"), a simple
  // forward move that lands directly on a valid tile should still be allowed.
  // With exactMoveRequired: the forward move is NOT a reversal and must NOT be blocked.

  @Test
  void alreadyOnFinish_LooselyClosedIn_CleanForwardMove_IsAllowed() {
    // pawn at (1,18), own pawn at (1,17) → isPawnLooselyClosedIn = true
    // +1 step → lands exactly at (1,19) with no direction reversal
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 18));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 17));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN — valid forward move, no ping-pong required
    assertNotEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("1", 19), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void alreadyOnFinish_LooselyClosedIn_Split7_CleanForwardMove_IsAllowed() {
    // Reproduces the user-reported bug: split 7 with one pawn going 18→19 (clean
    // forward move) and the other pawn moving 6 steps on the board.  The first pawn
    // has an own pawn at (1,17) behind it so isPawnLooselyClosedIn fires.  With
    // exactMoveRequired this was incorrectly rejected.
    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 18));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("0", 4));
    Pawn bystander = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 17));

    // WHEN: pawn1 moves 1 step (18→19), pawn2 moves 6 steps
    createSplitMessage(moveMessage, pawn1, 1, pawn2, 6, card);
    gameState.processOnSplit(moveMessage, moveResponse);

    // THEN
    assertNotEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("1", 19), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 10), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void alreadyOnFinish_PingPongLandsOnHighestReachableTile_CannotMove() {
    // pawn at (1,17) between own pawns at (1,16) and (1,19), +3 steps
    // → 18, 19 is blocked so it bounces back to 17, 16 is blocked so it bounces forward to 18
    // → lands on (1,18), which is exactly the tile it could have reached with 1 step, so a
    //   landing-tile comparison sees no overshoot and lets this ping-pong through
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 3);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 17));
    Pawn wallBehind = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));
    Pawn wallAhead = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 19));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("1", 17), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void split7_PingPongOnFinish_CannotMove() {
    // The reported bug, played as a split: pawns on 16, 17 and 19 plus one on the board.
    // Splitting 3/4 makes the pawn on 17 ping-pong between its own pawns and land on (1,18),
    // while the board pawn's 4 steps are a perfectly legal move — the whole split must still
    // be rejected, and neither pawn may move.
    // GIVEN
    Card card = givePlayerSeven(cardsDeck, 1);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 17));
    Pawn wallBehind = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));
    Pawn wallAhead = placePawnOnBoard(gameState, new PawnId("1", 2), new PositionKey("1", 19));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 3), new PositionKey("0", 4));

    // WHEN
    createSplitMessage(moveMessage, pawn1, 3, pawn2, 4, card);
    gameState.processOnSplit(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("1", 17), gameState.getPawn(pawn1).getCurrentTileId());
    assertEquals(new PositionKey("0", 4), gameState.getPawn(pawn2).getCurrentTileId());
  }

  @Test
  void alreadyOnFinish_LooselyClosedIn_CleanBackwardMove_IsAllowed() {
    // Mirror of alreadyOnFinish_LooselyClosedIn_CleanForwardMove_IsAllowed: an own pawn at (1,16)
    // makes the pawn on (1,19) loosely closed in, but -2 steps still lands straight on (1,17)
    // without touching that wall. What exactMoveRequired forbids is bouncing, not being boxed in.
    // (The deck's only backward card is the 4; a -2 card pins the engine rule itself.)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -2);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 19));
    Pawn wallBehind = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertNotEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("1", 17), gameState.getPawn(pawn1).getCurrentTileId());
  }

  // ── Case 4: pawn already on finish, loosely closed in → ping-pong needed ──
  // Without exactMoveRequired: pawn bounces back and forth between own pawns.
  // With exactMoveRequired: CANNOT_MAKE_MOVE.

  @Test
  void alreadyOnFinish_LooselyClosedIn_PingPongNeeded_CannotMove() {
    // pawn at (1,19) with own pawn at (1,16), -5 steps
    // → without setting: ping-pongs to (1,18)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, -5);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 19));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("1", 19), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void alreadyOnFinish_LooselyClosedIn_ForwardPingPongNeeded_CannotMove() {
    // pawn at (1,19) with own pawn at (1,16), +5 steps
    // → without setting: ping-pongs to (1,18)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 5);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 19));
    Pawn pawn2 = placePawnOnBoard(gameState, new PawnId("1", 1), new PositionKey("1", 16));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("1", 19), gameState.getPawn(pawn1).getCurrentTileId());
  }

  // ── Case 5: pawn already on finish, overshoots cap at tile 19 ───────────
  // Without exactMoveRequired: pawn bounces off tile 19 and lands lower.
  // With exactMoveRequired: CANNOT_MAKE_MOVE.

  @Test
  void alreadyOnFinish_OvershootsCap_ForwardMove_CannotMove() {
    // pawn at (1,18) + 3 steps → reaches 19 then bounces to 17
    // → without setting: lands at (1,17)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 3);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 18));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("1", 18), gameState.getPawn(pawn1).getCurrentTileId());
  }

  @Test
  void alreadyOnFinish_OvershootsCap_ExitsFinish_CannotMove() {
    // pawn at (1,19) + 4 steps → bounces off cap and exits finish to (0,15)
    // → without setting: lands at (0,15)
    // GIVEN
    Card card = givePlayerCard(cardsDeck, 1, 4);
    Pawn pawn1 = placePawnOnBoard(gameState, new PawnId("1", 0), new PositionKey("1", 19));

    // WHEN
    createMoveRequest(moveMessage, pawn1, card);
    gameState.processOnMove(moveMessage, moveResponse);

    // THEN
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertNull(moveResponse.getPawn1());
    assertEquals(new PositionKey("1", 19), gameState.getPawn(pawn1).getCurrentTileId());
  }
}