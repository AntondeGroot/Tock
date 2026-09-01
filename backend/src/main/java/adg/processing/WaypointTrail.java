package adg.processing;

import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

/**
 * The trail of tiles a moving pawn traces, in travel order: the tile it starts on, a waypoint at
 * every section corner it rounds, and the tile it lands on.
 *
 * <p>The client animates the pawn along this trail, so the corners are not decoration: without
 * them the pawn cuts straight across the board instead of following its edge. Owning the list here
 * keeps that geometry in one place, and testable without playing a whole move.
 */
final class WaypointTrail {

  /** A section turns at these tiles; the animation bends there. */
  private static final int[] SECTION_CORNERS = {1, 7, 13};

  private final LinkedList<PositionKey> tiles = new LinkedList<>();

  void add(PositionKey tile) {
    tiles.add(tile);
  }

  void add(String sectionId, int tileNr) {
    tiles.add(new PositionKey(sectionId, tileNr));
  }

  /**
   * Add a waypoint (in {@code sectionId}) at each section corner the pawn passes travelling from
   * {@code fromTile} to {@code toTile}, in that travel order — reversed when travelling backwards,
   * so the trail always reads in the order the pawn walks it.
   */
  void addCornersBetween(String sectionId, int fromTile, int toTile) {
    boolean forward = toTile > fromTile;
    int low = Math.min(fromTile, toTile);
    int high = Math.max(fromTile, toTile);
    for (int i = 0; i < SECTION_CORNERS.length; i++) {
      int corner = SECTION_CORNERS[forward ? i : SECTION_CORNERS.length - 1 - i];
      if (corner > low && corner < high) {
        tiles.add(new PositionKey(sectionId, corner));
      }
    }
  }

  /** Replace the trail with a ready-made one — the ping-pong bounce computes its own waypoints. */
  void replaceWith(List<PositionKey> waypoints) {
    tiles.clear();
    tiles.addAll(waypoints);
  }

  /** The tile the pawn ends on. */
  PositionKey last() {
    return tiles.getLast();
  }

  /** A copy of the trail, for handing to the response. */
  List<PositionKey> toList() {
    return new ArrayList<>(tiles);
  }
}
