package adg.processing;

import static adg.util.BoardLogic.isPawnOnFinish;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveType.MOVE;

import adg.keezen.GameState;
import adg.util.Log;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.MoveResult;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PositionKey;
import java.util.Optional;

public class ProcessOnMove {

  // ── Board geometry ────────────────────────────────────────────────────────

  private static final int START_TILE = 0; // first board tile of a section
  private static final int LAST_TILE = 15; // last board tile of a section (before the finish)
  private static final int SECTION_SIZE = 16; // a section spans tiles 0..15

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
  private String pawnOwnerId;
  private PositionKey currentTileId;
  private String playerIdOfTile;
  private int nrSteps;
  private int next;
  private final WaypointTrail trail = new WaypointTrail();

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

    Optional<MovePreconditions.Refusal> refusal =
        MovePreconditions.check(gs, moveMessage, pawn1, card);
    if (refusal.isPresent()) {
      reject(refusal.get().result(), refusal.get().reason());
      return;
    }

    initializeRouting();
    trail.add(currentTileId);
    response.setMoveType(MOVE);
    Log.info("GameState: OnMove: received msg: " + moveMessage);

    if (isForwardCrossSection())  { routeForwardCrossSection(); return; }
    if (isNormalRouteInSection()) { routeNormalInSection();     return; }
    if (next < START_TILE)                 { routeBackward();            return; }
    if (next == START_TILE)                { routeBackwardToStartTile(); return; }
    if (isPawnOnFinish(pawn1))    { routeAlreadyOnFinish();     return; }
    if (isEnteringFinish())       { routeEnteringFinish(); }
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
    trail.addCornersBetween(playerIdOfTile, from, LAST_TILE);
    if (from < LAST_TILE) trail.add(playerIdOfTile, LAST_TILE);
  }

  private void enterNextSection() {
    Log.info("GameState: OnMove: normal route can move to the next section");
    next = next % SECTION_SIZE;
    playerIdOfTile = gs.nextPlayerId(playerIdOfTile);
    trail.addCornersBetween(playerIdOfTile, START_TILE, next);
  }

  private boolean reverseBackInCurrentSection() {
    Log.info("GameState: OnMove: normal route is blocked by a start tile, move backwards");
    if (gs.isExactMoveRequired()) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.CANNOT_PASS_START_TILE);
      return false;
    }
    next = LAST_TILE - next % LAST_TILE;
    trail.add(playerIdOfTile, LAST_TILE);
    trail.addCornersBetween(playerIdOfTile, LAST_TILE, next);
    return true;
  }

  // ── Route: normal within section ─────────────────────────────────────────

  private void routeNormalInSection() {
    Log.info("GameState: OnMove: normal route between 0,15");
    addWaypointsWithinSection();
    finalizeMoveToPosition(new PositionKey(playerIdOfTile, next));
  }

  private void addWaypointsWithinSection() {
    trail.addCornersBetween(playerIdOfTile, currentTileId.getTileNr(), next);
  }

  // ── Route: backward past section ─────────────────────────────────────────

  private void routeBackward() {
    Log.info("GameState: OnMove: pawn goes backwards");
    if (currentTileId.getTileNr() > 1) trail.add(playerIdOfTile, 1);
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
    if (next < 13) trail.add(playerIdOfTile, 13);
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
    if (currentTileId.getTileNr() > 1) trail.add(playerIdOfTile, 1);
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
    if (movesOutOfFinish()) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.CANNOT_MOVE_OUT_OF_FINISH);
      return;
    }
    if (gs.isExactMoveRequired()) {
      moveOnFinishExactly();
      return;
    }
    if (gs.isPawnLooselyClosedIn(pawn1, currentTileId)) {
      executePingPongMove();
      return;
    }
    executeFinishMoveWithOvershootCheck();
  }

  /**
   * Whether this move would take the pawn back out of the finish, with the option that forbids it
   * enabled. Only the four moves backwards, so it is the only card that can do this — but the test
   * is on where the pawn LANDS, not on the card: a four that bounces off a wall inside the lane
   * never leaves it, and must stay legal.
   */
  private boolean movesOutOfFinish() {
    return gs.isCannotMoveOutOfFinish()
        && nrSteps < 0
        && gs.moveAndCheckEveryTile(pawn1, currentTileId, nrSteps).getTileNr() <= LAST_TILE;
  }

  /**
   * With exactMoveRequired only a straight path counts, so the single question is whether the pawn
   * has to bounce off a wall — not where it ends up. A bouncing pawn can land on the tile it could
   * have reached anyway, or even back on its own tile, so comparing landing tiles lets such moves
   * through.
   */
  private void moveOnFinishExactly() {
    if (gs.moveBouncesOffWall(pawn1, currentTileId, nrSteps)) {
      rejectBounceAsNotExact();
      return;
    }
    landOnFinishTile(gs.moveAndCheckEveryTile(pawn1, currentTileId, nrSteps));
  }

  private void rejectBounceAsNotExact() {
    if (nrSteps < 0) {
      // Bouncing backwards means own pawns box this one in from behind.
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.PAWN_CLOSED_IN_FINISH);
      return;
    }
    int highestReachable = gs.checkHighestTileNrYouCanMoveTo(pawn1, currentTileId, nrSteps);
    reject(CANNOT_MAKE_MOVE, MoveRejectionReason.MUST_MOVE_EXACT_STEPS,
        highestReachable - currentTileId.getTileNr());
  }

  private void executePingPongMove() {
    trail.replaceWith(gs.pingpongMove(pawn1, currentTileId, nrSteps));
    executeMoveAlongTrail(trail.last());
  }

  private void executeFinishMoveWithOvershootCheck() {
    PositionKey targetTileId = gs.moveAndCheckEveryTile(pawn1, currentTileId, nrSteps);
    if (nrSteps > 0) {
      int highestReachable = gs.checkHighestTileNrYouCanMoveTo(pawn1, currentTileId, nrSteps);
      if (highestReachable > targetTileId.getTileNr()) {
        addFinishBounceWaypoint(highestReachable);
      }
    }
    landOnFinishTile(targetTileId);
  }

  private void landOnFinishTile(PositionKey targetTileId) {
    addFinishReverseWaypoints(targetTileId);
    landOnTile(targetTileId);
  }

  private void addFinishBounceWaypoint(int highestReachable) {
    Log.info("GameState: OnMove: pawn moves out of the finish");
    trail.add(playerIdOfTile, highestReachable);
  }

  private void addFinishReverseWaypoints(PositionKey targetTile) {
    if (targetTile.getTileNr() < LAST_TILE) {
      trail.add(targetTile.getPlayerId(), LAST_TILE);
    }
    trail.addCornersBetween(targetTile.getPlayerId(), LAST_TILE, targetTile.getTileNr());
  }

  // ── Route: entering finish from last section ──────────────────────────────

  private void routeEnteringFinish() {
    Log.info("GameState: OnMove: pawn is on last section and goes into finish");
    addLandmarksToSectionEnd();
    PositionKey targetTileId = gs.moveAndCheckEveryTile(pawn1, currentTileId, nrSteps);
    if (gs.moveBouncesOffWall(pawn1, currentTileId, nrSteps)) {
      if (!addEnteringFinishOvershootWaypoints(targetTileId, highestReachableFinishTile())) return;
    }
    if (gs.cannotMoveToTileBecauseSamePlayer(pawn1, targetTileId)) {
      gs.clearResponse(response);
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.DESTINATION_OCCUPIED_BY_OWN_PAWN);
      return;
    }
    landOnTile(targetTileId);
  }

  /**
   * The furthest tile in the finish lane this move can reach. The look-ahead starts at finish tile
   * 15 (the entry point) with only the steps that reach into the lane: starting from
   * {@code currentTileId} would make checkHighestTileNrYouCanMoveTo check main-board tiles of the
   * player's own section, which can incorrectly truncate the look-ahead if own pawns sit there.
   */
  private int highestReachableFinishTile() {
    int stepsIntoFinish = next - LAST_TILE;
    return gs.checkHighestTileNrYouCanMoveTo(
        pawn1, new PositionKey(gs.nextPlayerId(playerIdOfTile), LAST_TILE), stepsIntoFinish);
  }

  private boolean addEnteringFinishOvershootWaypoints(
      PositionKey targetTileId, int highestReachable) {
    if (gs.isExactMoveRequired()) {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.MUST_MOVE_EXACT_STEPS,
          highestReachable - currentTileId.getTileNr());
      return false;
    }
    if (highestReachable > LAST_TILE) {
      trail.add(gs.nextPlayerId(playerIdOfTile), highestReachable);
      if (targetTileId.getTileNr() < LAST_TILE) {
        trail.add(targetTileId.getPlayerId(), LAST_TILE);
      }
    }
    trail.addCornersBetween(targetTileId.getPlayerId(), LAST_TILE, targetTileId.getTileNr());
    return true;
  }

  // ── Common helpers ────────────────────────────────────────────────────────

  private void finalizeMoveToPosition(PositionKey nextTileId) {
    trail.add(nextTileId);
    if (gs.canMoveToTile(pawn1, nextTileId)) {
      executeMoveAlongTrail(nextTileId);
    } else {
      reject(CANNOT_MAKE_MOVE, MoveRejectionReason.DESTINATION_BLOCKED);
    }
  }

  /** Land on {@code targetTile}: it closes the trail, and the move is carried out along it. */
  private void landOnTile(PositionKey targetTile) {
    trail.add(targetTile);
    executeMoveAlongTrail(targetTile);
  }

  /** Publish the trail as this move's path and carry the move out, landing on {@code targetTile}. */
  private void executeMoveAlongTrail(PositionKey targetTile) {
    response.setMovePawn1(trail.toList());
    MoveExecutor.execute(gs, pawn1, targetTile, moveMessage, response, goToNextPlayer);
  }
}