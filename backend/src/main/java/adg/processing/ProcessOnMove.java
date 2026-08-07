package adg.processing;

import static adg.util.BoardLogic.isPawnOnFinish;
import static adg.util.CardValueCheck.isJack;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.INVALID_SELECTION;
import static com.adg.openapi.model.MoveResult.PLAYER_DOES_NOT_HAVE_CARD;
import static com.adg.openapi.model.MoveType.MOVE;

import adg.keezen.GameState;
import adg.Log;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.MoveResult;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PositionKey;
import java.util.LinkedList;

public class ProcessOnMove {

  // ── Board geometry ────────────────────────────────────────────────────────

  private static final int START_TILE = 0; // first board tile of a section
  private static final int LAST_TILE = 15; // last board tile of a section (before the finish)
  private static final int SECTION_SIZE = 16; // a section spans tiles 0..15

  /** A section turns at these "corner" tiles; the animation bends there. */
  private static final int[] SECTION_CORNERS = {1, 7, 13};

  // ── Entry points ──────────────────────────────────────────────────────────

  public static void process(GameState gs, MoveRequest moveMessage, MoveResponse response) {
    process(gs, moveMessage, response, true);
  }

  public static void process(
      GameState gs, MoveRequest moveMessage, MoveResponse response, boolean goToNextPlayer) {
    new ProcessOnMove(gs, moveMessage, response, goToNextPlayer).execute();
  }

  // ── Instance state ────────────────────────────────────────────────────────

  private final GameState gs;
  private final MoveRequest moveMessage;
  private final MoveResponse response;
  private final boolean goToNextPlayer;

  private Pawn pawn1;
  private Card card;
  private String playerId;
  private String pawnOwnerId;
  private PositionKey currentTileId;
  private String playerIdOfTile;
  private int nrSteps;
  private int next;
  private final LinkedList<PositionKey> moves = new LinkedList<>();

  private ProcessOnMove(
      GameState gs, MoveRequest moveMessage, MoveResponse response, boolean goToNextPlayer) {
    this.gs = gs;
    this.moveMessage = moveMessage;
    this.response = response;
    this.goToNextPlayer = goToNextPlayer;
  }

  // ── Rejection helpers ─────────────────────────────────────────────────────

  private void reject(MoveResult result, MoveRejectionReason reason) {
    MoveResponses.reject(response, result, reason);
  }

  private void reject(MoveResult result, MoveRejectionReason reason, int detail) {
    MoveResponses.reject(response, result, reason, detail);
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  private void execute() {
    pawn1 = gs.getPawn(moveMessage.getPawn1Id());
    card = gs.getCard(moveMessage.getCardId(), moveMessage.getPlayerId());
    playerId = moveMessage.getPlayerId();

    if (!selectionIsValid()) return;
    if (!playerHasCard()) return;
    if (!pawnOwnershipIsValid()) return;

    initializeRouting();
    moves.add(currentTileId);
    response.setMoveType(MOVE);
    Log.info("GameState: OnMove: received msg: " + moveMessage);

    if (isForwardCrossSection())  { routeForwardCrossSection(); return; }
    if (isNormalRouteInSection()) { routeNormalInSection();     return; }
    if (next < START_TILE)                 { routeBackward();            return; }
    if (next == START_TILE)                { routeBackwardToStartTile(); return; }
    if (isPawnOnFinish(pawn1))    { routeAlreadyOnFinish();     return; }
    if (isEnteringFinish())       { routeEnteringFinish(); }
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private boolean selectionIsValid() {
    if (pawn1 == null || card == null) {
      reject(INVALID_SELECTION, MoveRejectionReason.INVALID_SELECTION);
      return false;
    }
    if (pawn1.getCurrentTileId().getTileNr() < 0) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.PAWN_ON_NEST);
      return false;
    }
    return true;
  }

  private boolean playerHasCard() {
    if (!gs.playerHasCard(playerId, card)) {
      reject(PLAYER_DOES_NOT_HAVE_CARD, MoveRejectionReason.DONT_HAVE_CARD);
      return false;
    }
    return true;
  }

  private boolean pawnOwnershipIsValid() {
    if (isJack(card)) return true;
    // Your own pawns, plus a teammate's once your own are all home (mayControlPawn).
    if (moveMessage.getPawn1Id() != null
        && !gs.mayControlPawn(playerId, gs.getPawn(moveMessage.getPawn1Id()))) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.NOT_YOUR_PAWN);
      return false;
    }
    if (moveMessage.getPawn2Id() != null
        && !gs.mayControlPawn(playerId, gs.getPawn(moveMessage.getPawn2Id()))) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.NOT_YOUR_PAWN);
      return false;
    }
    return true;
  }

  // ── Routing setup ─────────────────────────────────────────────────────────

  private void initializeRouting() {
    currentTileId = pawn1.getCurrentTileId();
    // A pawn always travels towards ITS OWN finish, so the route is read in the owner's frame of
    // reference — which is not the mover's in team play, where you play a teammate's pawns.
    pawnOwnerId = pawn1.getPlayerId();
    playerIdOfTile = currentTileId.getPlayerId();
    nrSteps = moveMessage.getStepsPawn1();
    next = currentTileId.getTileNr() + nrSteps;
  }

  private boolean isForwardCrossSection() {
    return next > LAST_TILE
        && !gs.isPawnOnLastSection(pawnOwnerId, playerIdOfTile)
        && !isPawnOnFinish(pawn1);
  }

  private boolean isNormalRouteInSection() {
    return next > START_TILE && next <= LAST_TILE && !isPawnOnFinish(pawn1);
  }

  private boolean isEnteringFinish() {
    return next > LAST_TILE && gs.isPawnOnLastSection(pawnOwnerId, playerIdOfTile);
  }

  // ── Route: forward cross-section ─────────────────────────────────────────

  private void routeForwardCrossSection() {
    Log.info("GameState: OnMove: normal route between 0,15 but could move to next section");
    addLandmarksToSectionEnd();
    PositionKey nextSectionStart = new PositionKey(gs.nextPlayerId(playerIdOfTile), START_TILE);
    if (gs.canPassStartTile(pawn1, nextSectionStart)) {
      enterNextSection();
    } else {
      if (!reverseBackInCurrentSection()) return;
    }
    finalizeMoveToPosition(new PositionKey(playerIdOfTile, next));
  }

  private void addLandmarksToSectionEnd() {
    int from = currentTileId.getTileNr();
    addCornerWaypointsBetween(playerIdOfTile, from, LAST_TILE);
    if (from < LAST_TILE) moves.add(new PositionKey(playerIdOfTile, LAST_TILE));
  }

  private void enterNextSection() {
    Log.info("GameState: OnMove: normal route can move to the next section");
    next = next % SECTION_SIZE;
    playerIdOfTile = gs.nextPlayerId(playerIdOfTile);
    addCornerWaypointsBetween(playerIdOfTile, START_TILE, next);
  }

  private boolean reverseBackInCurrentSection() {
    Log.info("GameState: OnMove: normal route is blocked by a start tile, move backwards");
    if (gs.isExactMoveRequired()) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.CANNOT_PASS_START_TILE);
      return false;
    }
    next = LAST_TILE - next % LAST_TILE;
    moves.add(new PositionKey(playerIdOfTile, LAST_TILE));
    addCornerWaypointsBetween(playerIdOfTile, LAST_TILE, next);
    return true;
  }

  // ── Route: normal within section ─────────────────────────────────────────

  private void routeNormalInSection() {
    Log.info("GameState: OnMove: normal route between 0,15");
    addWaypointsWithinSection();
    finalizeMoveToPosition(new PositionKey(playerIdOfTile, next));
  }

  /**
   * Add a waypoint (in {@code sectionId}) at each section corner the pawn passes as it travels from
   * {@code fromTile} to {@code toTile} (in that travel order), so the animation bends at each corner.
   */
  private void addCornerWaypointsBetween(String sectionId, int fromTile, int toTile) {
    boolean forward = toTile > fromTile;
    int low = Math.min(fromTile, toTile);
    int high = Math.max(fromTile, toTile);
    for (int i = 0; i < SECTION_CORNERS.length; i++) {
      int corner = SECTION_CORNERS[forward ? i : SECTION_CORNERS.length - 1 - i];
      if (corner > low && corner < high) {
        moves.add(new PositionKey(sectionId, corner));
      }
    }
  }

  private void addWaypointsWithinSection() {
    addCornerWaypointsBetween(playerIdOfTile, currentTileId.getTileNr(), next);
  }

  // ── Route: backward past section ─────────────────────────────────────────

  private void routeBackward() {
    Log.info("GameState: OnMove: pawn goes backwards");
    if (currentTileId.getTileNr() > 1) moves.add(new PositionKey(playerIdOfTile, 1));
    PositionKey ownStartTile = new PositionKey(playerIdOfTile, START_TILE);
    if (gs.canPassStartTile(pawn1, ownStartTile)) {
      crossIntoPreviousSection();
    } else {
      if (!reverseForwardFromStartTile()) return;
    }
    finalizeMoveToPosition(new PositionKey(playerIdOfTile, next));
  }

  private void crossIntoPreviousSection() {
    next = SECTION_SIZE + next;
    playerIdOfTile = gs.previousPlayerId(playerIdOfTile);
    if (next < 13) moves.add(new PositionKey(playerIdOfTile, 13));
  }

  private boolean reverseForwardFromStartTile() {
    Log.info("GameState: OnMove: pawn wants to go backwards but is blocked by a start tile, goes forwards");
    if (gs.isExactMoveRequired()) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.CANNOT_PASS_START_TILE);
      return false;
    }
    next = -next + 2;
    return true;
  }

  // ── Route: backward landing exactly on start tile ────────────────────────

  private void routeBackwardToStartTile() {
    Log.info("GameState: OnMove: pawn ends exactly on start tile");
    if (currentTileId.getTileNr() > 1) moves.add(new PositionKey(playerIdOfTile, 1));
    PositionKey startTile = new PositionKey(playerIdOfTile, START_TILE);
    if (gs.canMoveToTile(pawn1, startTile)) {
      landOnTile(startTile);
    } else if (startTileIsBlockedByOwnPawn(startTile)) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.DESTINATION_OCCUPIED_BY_OWN_PAWN);
    } else {
      landBeyondBlockadedStartTile();
    }
  }

  private boolean startTileIsBlockedByOwnPawn(PositionKey startTile) {
    return !gs.tileIsABlockade(startTile)
        && gs.cannotMoveToTileBecauseSamePlayer(pawn1, startTile);
  }

  private void landBeyondBlockadedStartTile() {
    PositionKey tile2 = new PositionKey(playerIdOfTile, 2);
    if (gs.canMoveToTile(pawn1, tile2)) {
      landOnTile(tile2);
    } else {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.CANNOT_PASS_START_TILE);
    }
  }

  // ── Route: pawn already on finish ────────────────────────────────────────

  private void routeAlreadyOnFinish() {
    Log.info("GameState: OnMove: pawn is already on the finish");
    if (gs.isPawnTightlyClosedIn(pawn1, currentTileId)) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.PAWN_CLOSED_IN_FINISH);
      return;
    }
    if (gs.isPawnLooselyClosedIn(pawn1, currentTileId)) {
      if (gs.isExactMoveRequired()) {
        if (nrSteps > 0) {
          // A forward move may still land cleanly without any direction reversal.
          // Delegate to the normal overshoot check: it rejects overshoots and
          // allows exact landings, so exactMoveRequired is honoured correctly.
          executeFinishMoveWithOvershootCheck();
          return;
        }
        reject(CANNOT_MAKE_MOVE, MoveRejectionReason.PAWN_CLOSED_IN_FINISH);
        return;
      }
      executePingPongMove();
      return;
    }
    executeFinishMoveWithOvershootCheck();
  }

  private void executePingPongMove() {
    LinkedList<PositionKey> pingpongmoves =
        new LinkedList<>(gs.pingpongMove(pawn1, currentTileId, nrSteps));
    moves.clear();
    moves.addAll(pingpongmoves);
    response.setMovePawn1(moves);
    gs.processMove(pawn1, pingpongmoves.getLast(), moveMessage, response, goToNextPlayer);
  }

  private void executeFinishMoveWithOvershootCheck() {
    PositionKey targetTileId = gs.moveAndCheckEveryTile(pawn1, currentTileId, nrSteps);
    if (nrSteps > 0) {
      int highestReachable = gs.checkHighestTileNrYouCanMoveTo(pawn1, currentTileId, nrSteps);
      if (highestReachable > targetTileId.getTileNr()) {
        if (!addFinishBounceWaypoint(highestReachable)) return;
      }
    }
    addFinishReverseWaypoints(targetTileId);
    moves.add(targetTileId);
    response.setMovePawn1(moves);
    gs.processMove(pawn1, targetTileId, moveMessage, response, goToNextPlayer);
  }

  private boolean addFinishBounceWaypoint(int highestReachable) {
    if (gs.isExactMoveRequired()) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.MUST_MOVE_EXACT_STEPS,
          highestReachable - currentTileId.getTileNr());
      return false;
    }
    Log.info("GameState: OnMove: pawn moves out of the finish");
    moves.add(new PositionKey(playerIdOfTile, highestReachable));
    return true;
  }

  private void addFinishReverseWaypoints(PositionKey targetTile) {
    if (targetTile.getTileNr() < LAST_TILE) {
      moves.add(new PositionKey(targetTile.getPlayerId(), LAST_TILE));
    }
    addCornerWaypointsBetween(targetTile.getPlayerId(), LAST_TILE, targetTile.getTileNr());
  }

  // ── Route: entering finish from last section ──────────────────────────────

  private void routeEnteringFinish() {
    Log.info("GameState: OnMove: pawn is on last section and goes into finish");
    addLandmarksToSectionEnd();
    PositionKey targetTileId = gs.moveAndCheckEveryTile(pawn1, currentTileId, nrSteps);
    // Start the look-ahead from finish tile 15 (the entry point) with only the steps
    // that reach into the finish lane. Using currentTileId directly would cause
    // checkHighestTileNrYouCanMoveTo to check main-board tiles of the player's own
    // section, which can incorrectly truncate the look-ahead if own pawns sit there.
    int stepsIntoFinish = next - LAST_TILE;
    int highestReachable = gs.checkHighestTileNrYouCanMoveTo(
        pawn1, new PositionKey(gs.nextPlayerId(playerIdOfTile), LAST_TILE), stepsIntoFinish);
    if (highestReachable > targetTileId.getTileNr()) {
      if (!addEnteringFinishOvershootWaypoints(targetTileId, highestReachable)) return;
    }
    if (gs.cannotMoveToTileBecauseSamePlayer(pawn1, targetTileId)) {
      gs.clearResponse(response);
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.DESTINATION_OCCUPIED_BY_OWN_PAWN);
      return;
    }
    moves.add(targetTileId);
    response.setMovePawn1(moves);
    gs.processMove(pawn1, targetTileId, moveMessage, response, goToNextPlayer);
  }

  private boolean addEnteringFinishOvershootWaypoints(
      PositionKey targetTileId, int highestReachable) {
    if (gs.isExactMoveRequired()) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.MUST_MOVE_EXACT_STEPS,
          highestReachable - currentTileId.getTileNr());
      return false;
    }
    if (highestReachable > LAST_TILE) {
      moves.add(new PositionKey(gs.nextPlayerId(playerIdOfTile), highestReachable));
      if (targetTileId.getTileNr() < LAST_TILE) {
        moves.add(new PositionKey(targetTileId.getPlayerId(), LAST_TILE));
      }
    }
    addCornerWaypointsBetween(targetTileId.getPlayerId(), LAST_TILE, targetTileId.getTileNr());
    return true;
  }

  // ── Common helpers ────────────────────────────────────────────────────────

  private void finalizeMoveToPosition(PositionKey nextTileId) {
    moves.add(nextTileId);
    if (gs.canMoveToTile(pawn1, nextTileId)) {
      response.setMovePawn1(moves);
      gs.processMove(pawn1, nextTileId, moveMessage, response, goToNextPlayer);
    } else {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.DESTINATION_BLOCKED);
    }
  }

  private void landOnTile(PositionKey targetTile) {
    moves.add(targetTile);
    response.setMovePawn1(moves);
    gs.processMove(pawn1, targetTile, moveMessage, response, goToNextPlayer);
  }
}