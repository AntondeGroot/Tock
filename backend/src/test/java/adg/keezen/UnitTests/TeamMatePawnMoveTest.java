package adg.keezen.UnitTests;

import static adg.keezen.UnitTests.GameStateUtil.givePlayerCard;
import static adg.keezen.UnitTests.GameStateUtil.place4PawnsOnFinish;
import static adg.keezen.UnitTests.GameStateUtil.placePawnOnBoard;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static com.adg.openapi.model.MoveType.MOVE;
import static com.adg.openapi.model.MoveType.ON_BOARD;
import static com.adg.openapi.model.MoveType.SPLIT;
import static com.adg.openapi.model.TempMessageType.MAKE_MOVE;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.processing.MoveAvailabilityChecker;
import adg.processing.ProcessOnBoard;
import adg.processing.ProcessOnMove;
import adg.processing.ProcessOnSplit;
import adg.processing.SevenSplitRecommender;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.PositionKey;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Team play: once all your own pawns are home you play your teammate's pawns. Every board rule
 * must then be evaluated in the <em>pawn owner's</em> frame of reference, not the mover's — the
 * pawn keeps travelling towards its own finish over its own start tile, no matter who pushes it.
 *
 * <p>Seats are not shuffled, so players "0".."3" sit in that order and "0" teams up with "2".
 * A pawn owned by "2" enters its finish from section "1" (the section before its own).
 */
class TeamMatePawnMoveTest {

  private static final String MOVER = "0";
  private static final String TEAM_MATE = "2";

  private GameState gameState;
  private CardsDeckInterface cardsDeck;
  private MoveResponse moveResponse;

  @BeforeEach
  void setUp() {
    GameSession engine = new GameSession();
    gameState = engine.getGameState();
    cardsDeck = engine.getCardsDeck();
    gameState.setTeamPlay(true);
    for (int i = 0; i < 4; i++) {
      gameState.addPlayer(new Player(String.valueOf(i), String.valueOf(i)));
    }
    gameState.start(false); // no shuffle → seat == insertion order
    // The hand-off rule: the mover may only play a teammate's pawns once their own are all home.
    place4PawnsOnFinish(gameState, MOVER);
    moveResponse = new MoveResponse();
  }

  @AfterEach
  void tearDown() {
    gameState.tearDown();
    cardsDeck.reset();
  }

  /** A card of this value, added to the mover's own hand. */
  private Card cardForMover(int value) {
    return givePlayerCard(cardsDeck, Integer.parseInt(MOVER), value);
  }

  /** A move of the teammate's pawn, played with a card from the mover's own hand. */
  private MoveRequest moveByMover(Pawn pawn, Card card) {
    MoveRequest request = new MoveRequest();
    request.setPlayerId(MOVER);
    request.setPawn1Id(pawn.getPawnId());
    request.setMoveType(MOVE);
    request.setStepsPawn1(card.getValue());
    request.setCardId(card.getUuid());
    request.setTempMessageType(MAKE_MOVE);
    return request;
  }

  private static Pawn teamMatePawnAt(GameState gameState, PositionKey tile) {
    return placePawnOnBoard(gameState, new PawnId(TEAM_MATE, 0), tile);
  }

  @Test
  void teamMatePawnEntersItsOwnFinish_insteadOfPassingItsOwnStartTile() {
    // GIVEN the teammate's pawn is on the last section before its own finish
    Card card = cardForMover(3);
    Pawn pawn = teamMatePawnAt(gameState, new PositionKey("1", 14));

    // WHEN the mover plays it three steps forward
    ProcessOnMove.process(gameState, moveByMover(pawn, card), moveResponse);

    // THEN it turns into its own finish, rather than travelling on over its own start tile
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey(TEAM_MATE, 17), moveResponse.getMovePawn1().getLast());
    assertEquals(new PositionKey(TEAM_MATE, 17), gameState.getPawn(pawn).getCurrentTileId());
  }

  @Test
  void teamMatePawnCrossesTheMoversStartTile_insteadOfTurningIntoTheFinish() {
    // GIVEN the teammate's pawn is on section "3" — the last section before the MOVER's finish,
    // but just an ordinary stretch of board for a pawn owned by "2"
    Card card = cardForMover(3);
    Pawn pawn = teamMatePawnAt(gameState, new PositionKey("3", 14));

    // WHEN the mover plays it three steps forward
    ProcessOnMove.process(gameState, moveByMover(pawn, card), moveResponse);

    // THEN it simply walks on over the mover's start tile; the mover's finish is not its finish
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey(MOVER, 1), moveResponse.getMovePawn1().getLast());
    assertEquals(new PositionKey(MOVER, 1), gameState.getPawn(pawn).getCurrentTileId());
  }

  @Test
  void teamMatePawnFromTheNestLandsOnItsOwnStartTile() {
    // GIVEN a King in the mover's hand and the teammate's pawn still on its nest
    Card king = cardForMover(13);
    Pawn pawn = gameState.getPawn(new PawnId(TEAM_MATE, 0));

    // WHEN the mover brings it onto the board
    MoveRequest request = moveByMover(pawn, king);
    request.setMoveType(ON_BOARD);
    ProcessOnBoard.process(gameState, request, moveResponse);

    // THEN it appears on the teammate's own start tile, not on the mover's
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey(TEAM_MATE, 0), moveResponse.getMovePawn1().getLast());
    assertEquals(new PositionKey(TEAM_MATE, 0), gameState.getPawn(pawn).getCurrentTileId());
  }

  @Test
  void teamMatePawnBouncesOffItsOwnPawnInItsOwnFinishLane() {
    // GIVEN the teammate's pawn is about to enter its finish, where a second pawn of theirs
    // walls off tile 18. The mover's four pawns fill the mover's own finish (tiles 16..19 of
    // section "0") — a different lane entirely, so they must neither block nor divert.
    Card card = cardForMover(3);
    Pawn pawn = teamMatePawnAt(gameState, new PositionKey("1", 15));
    placePawnOnBoard(gameState, new PawnId(TEAM_MATE, 1), new PositionKey(TEAM_MATE, 18));

    // WHEN the mover plays it three steps, overshooting that wall
    ProcessOnMove.process(gameState, moveByMover(pawn, card), moveResponse);

    // THEN it advances up the teammate's lane to 17 and bounces back to 16
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertTrue(
        moveResponse.getMovePawn1().contains(new PositionKey(TEAM_MATE, 17)),
        "turns around at the teammate's own pawn, not at the mover's finish");
    assertEquals(new PositionKey(TEAM_MATE, 16), gameState.getPawn(pawn).getCurrentTileId());
  }

  @Test
  void teamMatePawnIsRejectedInsteadOfBouncing_whenExactMovesAreRequired() {
    // GIVEN the same overshoot as above, but the game demands exact moves
    gameState.setExactMoveRequired(true);
    Card card = cardForMover(3);
    Pawn pawn = teamMatePawnAt(gameState, new PositionKey("1", 15));
    placePawnOnBoard(gameState, new PawnId(TEAM_MATE, 1), new PositionKey(TEAM_MATE, 18));

    // WHEN the mover plays it three steps, which cannot land cleanly
    ProcessOnMove.process(gameState, moveByMover(pawn, card), moveResponse);

    // THEN the move is refused rather than bounced, and the pawn has not budged
    assertEquals(CANNOT_MAKE_MOVE, moveResponse.getResult());
    assertEquals(MoveRejectionReason.MUST_MOVE_EXACT_STEPS, moveResponse.getRejectionReason());
    assertEquals(2, moveResponse.getRejectionDetail(), "the furthest it could legally go");
    assertEquals(new PositionKey("1", 15), gameState.getPawn(pawn).getCurrentTileId());
  }

  @Test
  void aSevenIsSplitAcrossTwoOfTheTeamMatesPawns_usingTheMoversOwnCard() {
    // GIVEN two of the teammate's pawns on the board and a seven in the MOVER's hand
    Card seven = cardForMover(7);
    Pawn first = teamMatePawnAt(gameState, new PositionKey("1", 2));
    Pawn second = placePawnOnBoard(gameState, new PawnId(TEAM_MATE, 1), new PositionKey("1", 8));

    // WHEN the mover splits it three/four over the pair
    MoveRequest request = moveByMover(first, seven);
    request.setMoveType(SPLIT);
    request.setPawn2Id(second.getPawnId());
    request.setStepsPawn1(3);
    request.setStepsPawn2(4);
    ProcessOnSplit.process(gameState, request, moveResponse);

    // THEN the split is played from the mover's hand — the teammate need not hold the card
    assertEquals(CAN_MAKE_MOVE, moveResponse.getResult());
    assertEquals(new PositionKey("1", 5), gameState.getPawn(first).getCurrentTileId());
    assertEquals(new PositionKey("1", 12), gameState.getPawn(second).getCurrentTileId());
  }

  @Test
  void mustPlayIfPossible_countsTheTeamMatesPawns_onceYourOwnAreAllHome() {
    // GIVEN the mover's own four pawns are home (never movable), and the only pawn left to
    // play is the teammate's — squarely on the board with a five in the mover's hand
    Card card = cardForMover(5);
    teamMatePawnAt(gameState, new PositionKey("1", 3));

    // THEN the mover does have a move, so "must play if possible" keeps holding them to it
    assertTrue(MoveAvailabilityChecker.hasAvailableMove(gameState, MOVER, List.of(card)));
  }

  @Test
  void theSuggestedSevenSplit_walksTheTeamMatesPawnAsDeepIntoTheirFinishAsItGoes() {
    // GIVEN one of the teammate's pawns six steps short of the end of their finish, and a
    // second with no wall anywhere near it
    Card seven = cardForMover(7);
    Pawn nearFinish = teamMatePawnAt(gameState, new PositionKey("1", 13));
    Pawn inTheOpen = placePawnOnBoard(gameState, new PawnId(TEAM_MATE, 1), new PositionKey("3", 5));

    // WHEN the mover asks how to divide the seven
    MoveRequest request = moveByMover(nearFinish, seven);
    request.setMoveType(SPLIT);
    request.setPawn2Id(inTheOpen.getPawnId());
    int[] recommended = SevenSplitRecommender.recommend(gameState, request);

    // THEN six steps go to the pawn that can reach the far end of its own finish
    assertNotNull(recommended, "the teammate's finish is a wall worth suggesting a split for");
    assertArrayEquals(new int[] {6, 1}, recommended);
  }
}