package adg.keezen;

import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;

/**
 * Where the pawns stand, and what that allows: the questions a move asks about the board while it
 * works out where a pawn can go. Read-only — a move is carried out through {@link GameState}.
 *
 * <p>Besides the real board ({@link GameState#board()}) there are what-if boards, from {@link
 * #withPawnMovedTo}: a 7-split checks its second pawn on the board as it will be once the first
 * has moved, without moving it — so a check never changes the game, even for a moment.
 */
public interface Board {

  /** The pawn with this id, or null if it isn't on the board. */
  Pawn getPawn(PawnId pawnId);

  /** The pawn standing on this tile, or null if the tile is empty. */
  Pawn getPawn(PositionKey tile);

  /** This board as it would be with {@code pawn} on {@code tile} — this board itself unchanged. */
  Board withPawnMovedTo(Pawn pawn, PositionKey tile);

  boolean canMoveToTile(Pawn selectedPawn, PositionKey nextTileId);

  boolean cannotMoveToTileBecauseSamePlayer(Pawn selectedPawn, PositionKey nextTileId);

  boolean canPassStartTile(Pawn selectedPawn, PositionKey tileId);

  boolean tileIsABlockade(PositionKey selectedStartTile);

  boolean isPawnLooselyClosedIn(Pawn pawn, PositionKey tileId);

  boolean isPawnTightlyClosedIn(Pawn pawn, PositionKey tileId);

  int checkHighestTileNrYouCanMoveTo(Pawn pawn, PositionKey tileId, int nrSteps);

  ArrayList<PositionKey> pingpongMove(Pawn pawn, PositionKey tileId, int nrSteps);

  PositionKey moveAndCheckEveryTile(Pawn pawn, PositionKey tileId, int nrSteps);

  boolean moveBouncesOffWall(Pawn pawn, PositionKey tileId, int nrSteps);
}
