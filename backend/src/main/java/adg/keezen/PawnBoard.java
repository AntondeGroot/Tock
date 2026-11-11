package adg.keezen;

import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import java.util.function.Function;

/**
 * A {@link Board} read through two lookups — a pawn by id, a pawn by tile — with the reachability
 * rules of {@link TileReachability} on top. The real board looks up the live pawns; a what-if
 * board wraps those lookups so that one pawn reads as moved, and touches no pawn at all.
 */
final class PawnBoard implements Board {

  private final Function<PawnId, Pawn> pawnWithId;
  private final Function<PositionKey, Pawn> pawnAt;
  private final Function<String, String> previousPlayerId;
  private final TileReachability reachability;

  PawnBoard(
      Function<PawnId, Pawn> pawnWithId,
      Function<PositionKey, Pawn> pawnAt,
      Function<String, String> previousPlayerId) {
    this.pawnWithId = pawnWithId;
    this.pawnAt = pawnAt;
    this.previousPlayerId = previousPlayerId;
    this.reachability = new TileReachability(pawnAt, previousPlayerId);
  }

  @Override
  public Pawn getPawn(PawnId pawnId) {
    return pawnWithId.apply(pawnId);
  }

  @Override
  public Pawn getPawn(PositionKey tile) {
    return pawnAt.apply(tile);
  }

  /**
   * The pawn reads as standing on {@code tile} — a copy of it, so the real pawn keeps its place —
   * and its old tile as empty. Whatever stood on {@code tile} is out of sight, as it would be once
   * the pawn had landed there: an own pawn cannot be landed on, an opponent's is sent home.
   */
  @Override
  public Board withPawnMovedTo(Pawn pawn, PositionKey tile) {
    PawnId movedId = pawn.getPawnId();
    Pawn moved = new Pawn(pawn.getPlayerId(), movedId, tile, pawn.getNestTileId());
    return new PawnBoard(
        id -> movedId.equals(id) ? moved : pawnWithId.apply(id),
        at -> tile.equals(at) ? moved : unlessIt(movedId, pawnAt.apply(at)),
        previousPlayerId);
  }

  /** {@code found}, unless it is the pawn that moved away: then its old tile reads as empty. */
  private static Pawn unlessIt(PawnId movedId, Pawn found) {
    return found != null && movedId.equals(found.getPawnId()) ? null : found;
  }

  @Override
  public boolean canMoveToTile(Pawn selectedPawn, PositionKey nextTileId) {
    return reachability.canMoveToTile(selectedPawn, nextTileId);
  }

  @Override
  public boolean cannotMoveToTileBecauseSamePlayer(Pawn selectedPawn, PositionKey nextTileId) {
    return reachability.cannotMoveToTileBecauseSamePlayer(selectedPawn, nextTileId);
  }

  @Override
  public boolean canPassStartTile(Pawn selectedPawn, PositionKey tileId) {
    return reachability.canPassStartTile(selectedPawn, tileId);
  }

  @Override
  public boolean tileIsABlockade(PositionKey selectedStartTile) {
    return reachability.tileIsABlockade(selectedStartTile);
  }

  @Override
  public boolean isPawnLooselyClosedIn(Pawn pawn, PositionKey tileId) {
    return reachability.isPawnLooselyClosedIn(pawn, tileId);
  }

  @Override
  public boolean isPawnTightlyClosedIn(Pawn pawn, PositionKey tileId) {
    return reachability.isPawnTightlyClosedIn(pawn, tileId);
  }

  @Override
  public int checkHighestTileNrYouCanMoveTo(Pawn pawn, PositionKey tileId, int nrSteps) {
    return reachability.checkHighestTileNrYouCanMoveTo(pawn, tileId, nrSteps);
  }

  @Override
  public ArrayList<PositionKey> pingpongMove(Pawn pawn, PositionKey tileId, int nrSteps) {
    return reachability.pingpongMove(pawn, tileId, nrSteps);
  }

  @Override
  public PositionKey moveAndCheckEveryTile(Pawn pawn, PositionKey tileId, int nrSteps) {
    return reachability.moveAndCheckEveryTile(pawn, tileId, nrSteps);
  }

  @Override
  public boolean moveBouncesOffWall(Pawn pawn, PositionKey tileId, int nrSteps) {
    return reachability.moveBouncesOffWall(pawn, tileId, nrSteps);
  }
}
