package adg.keezen;

import static adg.util.BoardLogic.isPawnOnFinish;

import adg.util.PlayerStatus;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * Lookups over the pawns currently on the board: find a pawn by id or by the tile it sits on, read a
 * pawn's tile, and move a pawn. Extracted from GameState as queries over the (live) pawns list —
 * supplied lazily because GameState replaces the list on reset. GameState keeps thin delegating
 * methods.
 */
class PawnLocations {

  private static final int PAWNS_PER_PLAYER = 4;

  private final Supplier<List<Pawn>> pawns;

  PawnLocations(Supplier<List<Pawn>> pawns) {
    this.pawns = pawns;
  }

  /** The pawn with this id, or null if it isn't on the board. */
  Pawn withId(PawnId pawnId) {
    for (Pawn pawn : pawns.get()) {
      if (pawn.getPawnId().equals(pawnId)) {
        return pawn;
      }
    }
    return null;
  }

  /** The pawn sitting on this tile, or null if the tile is empty. */
  Pawn atTile(PositionKey tile) {
    for (Pawn pawn : pawns.get()) {
      if (pawn.getCurrentTileId().equals(tile)) {
        return pawn;
      }
    }
    return null;
  }

  /** True when all of this player's pawns sit on the finish lane (i.e. the player is home). */
  boolean allPawnsOnFinish(String playerId) {
    return pawns.get().stream()
        .filter(pawn -> playerId.equals(pawn.getPlayerId()))
        .filter(pawn -> isPawnOnFinish(pawn))
        .count() == PAWNS_PER_PLAYER;
  }

  /**
   * A fresh set of pawns for these players: {@value #PAWNS_PER_PLAYER} each, every pawn starting on
   * its own nest tile. Returns a new list rather than mutating in place because a restart replaces
   * the board wholesale.
   */
  ArrayList<Pawn> createFor(List<Player> players) {
    ArrayList<Pawn> created = new ArrayList<>();
    for (Player player : players) {
      if (PlayerStatus.isPlaceholder(player)) {
        continue; // an empty seat owns a section of board, but nobody plays it
      }
      for (int pawnNr = 0; pawnNr < PAWNS_PER_PLAYER; pawnNr++) {
        PositionKey nestPosition = new PositionKey(player.getId(), -1 - pawnNr);
        created.add(
            new Pawn(player.getId(), new PawnId(player.getId(), pawnNr), nestPosition, nestPosition));
      }
    }
    return created;
  }

  /** Send every pawn back to its nest, keeping the same pawn objects (used by a round reset). */
  void resetAllToNest() {
    for (Pawn pawn : pawns.get()) {
      pawn.setCurrentTileId(pawn.getNestTileId());
    }
  }

  /** Take every one of this player's pawns off the board — they have left the game for good. */
  void removeAllFor(String playerId) {
    pawns.get().removeIf(pawn -> playerId.equals(pawn.getPlayerId()));
  }

  /** Set a pawn's location without any validation (matched by pawn id). */
  void moveTo(Pawn selectedPawn) {
    for (Pawn pawn : pawns.get()) {
      if (pawn.getPawnId().equals(selectedPawn.getPawnId())) {
        pawn.setCurrentTileId(selectedPawn.getCurrentTileId());
        return;
      }
    }
  }
}
