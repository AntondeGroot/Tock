package adg.keezen;

import adg.Log;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import java.util.Objects;
import java.util.function.Function;

/**
 * Pure board-reachability rules for a single pawn: whether it can land on / pass a tile, whether a
 * tile is a blockade, and how far it can advance before a wall. Extracted from GameState so the
 * geometry lives in one small, directly testable unit; the only state it needs is "which pawn (if
 * any) sits on a given tile", injected as a lookup. GameState keeps thin delegating methods.
 */
class TileReachability {

  private final Function<PositionKey, Pawn> pawnAt;
  private final Function<String, String> previousPlayerId;

  TileReachability(
      Function<PositionKey, Pawn> pawnAt, Function<String, String> previousPlayerId) {
    this.pawnAt = pawnAt;
    this.previousPlayerId = previousPlayerId;
  }

  /**
   * @return true if the pawn may end on {@code nextTileId}: true onto an empty tile or its own
   *     position, false onto another of the player's own pawns, false onto a blockaded start tile.
   */
  boolean canMoveToTile(Pawn selectedPawn, PositionKey nextTileId) {
    if (nextTileId.getTileNr() > 19) {
      return false;
    }
    Pawn pawn = pawnAt.apply(nextTileId);
    if (pawn != null) {
      Log.info("found pawn on start tile: " + pawn);
      if (pawn.getPawnId().equals(selectedPawn.getPawnId())) {
        return true;
      }
      if (Objects.equals(pawn.getPlayerId(), selectedPawn.getPlayerId())) {
        return false;
      }
      if (Objects.equals(pawn.getPlayerId(), nextTileId.getPlayerId())
          && nextTileId.getTileNr() == 0) {
        return false;
      }
    }
    return true;
  }

  boolean cannotMoveToTileBecauseSamePlayer(Pawn selectedPawn, PositionKey nextTileId) {
    Pawn pawn = pawnAt.apply(nextTileId);
    if (pawn != null) {
      if (Objects.equals(pawn.getPlayerId(), selectedPawn.getPlayerId())
          && !pawn.getPawnId().equals(selectedPawn.getPawnId())) {
        return true;
      }
    }
    return false;
  }

  boolean canPassStartTile(Pawn selectedPawn, PositionKey tileId) {
    Pawn pawnOnTile = pawnAt.apply(tileId);
    if (pawnOnTile == null) {
      return true;
    }
    if (selectedPawn.getPawnId().equals(pawnOnTile.getPawnId())) {
      return true;
    }
    if (Objects.equals(pawnOnTile.getPlayerId(), tileId.getPlayerId())) {
      return false;
    }
    return true;
  }

  boolean tileIsABlockade(PositionKey selectedStartTile) {
    Pawn pawnOnStart = pawnAt.apply(selectedStartTile);
    if (pawnOnStart == null) {
      return false;
    }
    return Objects.equals(pawnOnStart.getPawnId().getPlayerId(), selectedStartTile.getPlayerId());
  }

  boolean isPawnLooselyClosedIn(Pawn pawn, PositionKey tileId) {
    int tileNr = tileId.getTileNr();
    String playerId = pawn.getPlayerId();

    if (tileNr <= 16) {
      return false;
    }

    for (int i = tileId.getTileNr(); i > 16; i--) {
      if (!canMoveToTile(pawn, new PositionKey(playerId, i - 1))) {
        return true;
      }
    }

    return false;
  }

  boolean isPawnTightlyClosedIn(Pawn pawn, PositionKey tileId) {
    String playerId = pawn.getPlayerId();

    if (tileId.getTileNr() == 19 && !canMoveToTile(pawn, new PositionKey(playerId, 18))) {
      return true;
    }
    if (tileId.getTileNr() == 18
        && !canMoveToTile(pawn, new PositionKey(playerId, 19))
        && !canMoveToTile(pawn, new PositionKey(playerId, 17))) {
      return true;
    }
    if (tileId.getTileNr() == 17
        && !canMoveToTile(pawn, new PositionKey(playerId, 18))
        && !canMoveToTile(pawn, new PositionKey(playerId, 16))) {
      return true;
    }

    return false;
  }

  int checkHighestTileNrYouCanMoveTo(Pawn pawn, PositionKey tileId, int nrSteps) {
    int direction = 1;
    int tileNrToCheck = tileId.getTileNr();

    if (nrSteps < 0) {
      direction = -1;
      nrSteps = -nrSteps;
    }

    for (int i = 0; i < nrSteps; i++) {
      tileNrToCheck = tileNrToCheck + direction;
      if (!canMoveToTile(pawn, new PositionKey(pawn.getPlayerId(), tileNrToCheck))) {
        return tileNrToCheck - 1;
      }
    }
    return tileNrToCheck;
  }

  /** The bouncing ("ping-pong") path when a pawn overshoots a wall inside the finish lane. */
  ArrayList<PositionKey> pingpongMove(Pawn pawn, PositionKey tileId, int nrSteps) {
    // it is already guaranteed that a pawn is loosely closed in on the finish tiles
    ArrayList<PositionKey> moves = new ArrayList<>();
    int direction = 1;
    int tileNrToCheck = tileId.getTileNr();
    moves.add(tileId);
    if (nrSteps < 0) {
      direction = -1;
      nrSteps = Math.abs(nrSteps);
    }

    for (int i = 0; i < nrSteps; i++) {
      tileNrToCheck = tileNrToCheck + direction;
      if (!canMoveToTile(pawn, new PositionKey(pawn.getPlayerId(), tileNrToCheck))) {
        moves.add(new PositionKey(pawn.getPlayerId(), tileNrToCheck - direction));
        direction = -direction;
        tileNrToCheck = tileNrToCheck + 2 * direction;
      }
    }
    moves.add(new PositionKey(pawn.getPlayerId(), tileNrToCheck));

    // an extra check to see if the first two moves are identical. this can happen when you do -4
    // steps and are closed in from behind or try to move forward but are blocked that way.
    if (moves.size() >= 2 && moves.get(0).equals(moves.get(1))) {
      moves.removeFirst();
    }
    return moves;
  }

  /** The final tile a pawn lands on, bouncing off walls only once it's inside the finish lane. */
  PositionKey moveAndCheckEveryTile(Pawn pawn, PositionKey tileId, int nrSteps) {
    return walkThroughFinish(pawn, tileId, nrSteps).target();
  }

  /**
   * Whether the path bounces off a wall in the finish lane — an own pawn standing in it, or its
   * closed end. Such a move is not an exact one, however far the bouncing pawn happens to end up:
   * it can even bounce between two walls and land right where it started, so the landing tile alone
   * cannot tell the two apart.
   */
  boolean moveBouncesOffWall(Pawn pawn, PositionKey tileId, int nrSteps) {
    return walkThroughFinish(pawn, tileId, nrSteps).bounced();
  }

  /** Where a move ends up, and whether it had to bounce to get there. */
  private record FinishPath(PositionKey target, boolean bounced) {}

  private FinishPath walkThroughFinish(Pawn pawn, PositionKey tileId, int nrSteps) {
    int direction = nrSteps < 0 ? -1 : 1;
    int nrStepsToTake = Math.abs(nrSteps);
    int tileNrToCheck = tileId.getTileNr();
    boolean bounced = false;

    for (int i = 0; i < nrStepsToTake; i++) {
      tileNrToCheck = tileNrToCheck + direction;
      if (tileNrToCheck > 15) { // only check tiles when they are on the finish
        if (!canMoveToTile(pawn, new PositionKey(pawn.getPlayerId(), tileNrToCheck))) {
          direction = -direction;
          tileNrToCheck = tileNrToCheck + 2 * direction;
          bounced = true;
        }
      }
    }

    if (tileNrToCheck <= 15) { // when back on the last section, change the playerId of the section
      return new FinishPath(
          new PositionKey(previousPlayerId.apply(pawn.getPlayerId()), tileNrToCheck), bounced);
    }

    return new FinishPath(new PositionKey(pawn.getPlayerId(), tileNrToCheck), bounced);
  }
}
