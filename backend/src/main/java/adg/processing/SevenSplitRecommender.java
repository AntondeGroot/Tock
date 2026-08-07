package adg.processing;

import static adg.util.CardValueCheck.isSeven;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;

import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.PositionKey;
import java.util.List;
import java.util.function.ToIntFunction;

/**
 * Suggests how to split a 7 between two selected pawns so that a pawn advances as far as possible
 * up to the nearest "wall" — the obvious intent. A wall is either:
 * <ul>
 *   <li>the finish end (move a pawn as deep into the finish as it can go), or
 *   <li>a same-colour blockade sitting on a start tile ahead (advance the pawn right up against it,
 *       without bouncing off).
 * </ul>
 * Finish takes priority over a blockade. The pawn order is never changed — only the step allocation
 * is chosen, and only valid splits are suggested (else {@code null}, keeping the client's 0/7
 * default), so the suggestion can never produce an unplayable selection.
 *
 * <p>Each candidate move is evaluated with a non-mutating {@link ProcessOnMove} CHECK (deliberately
 * NOT {@code ProcessOnSplit}, which temporarily mutates the shared game state). A pawn's furthest
 * forward reach is the step count whose landing tile has the highest forward position along the
 * pawn's path to its finish; overshooting a wall bounces the pawn back to a lower position.
 */
public final class SevenSplitRecommender {

  private static final int FINISH_FIRST_TILE = 16;
  private static final int TILES_PER_SECTION = 16; // board tiles 0-15
  /** A pawn must be at least this far along a section for a wall (finish/next start) to be in reach. */
  private static final int WALL_REACH_TILE = 8;

  private enum Kind { FINISH, BLOCKADE, FREE, NONE }

  private record Analysis(Kind kind, int bestSteps, int landingTileNr) {}

  private SevenSplitRecommender() {}

  /**
   * @return {@code [stepsPawn1, stepsPawn2]} advancing a pawn up to its nearest wall, or
   *     {@code null} if this isn't a 7-split with two pawns or no pawn has a wall within reach.
   */
  public static int[] recommend(GameState gs, MoveRequest request) {
    if (request.getPawn1Id() == null || request.getPawn2Id() == null) {
      return null;
    }
    Integer cardId = request.getCardId();
    if (cardId == null) {
      return null;
    }
    Card card = gs.getCard(cardId, request.getPlayerId());
    if (card == null || !isSeven(card)) {
      return null;
    }

    // Cheap exit: unless a pawn is near the finish or a blockaded start tile, there's no wall to
    // advance toward, so skip the per-step search entirely (the common case).
    if (!mightHaveWall(gs, request.getPawn1Id()) && !mightHaveWall(gs, request.getPawn2Id())) {
      return null;
    }

    Analysis a1 = analyze(gs, request, request.getPawn1Id(), cardId);
    Analysis a2 = analyze(gs, request, request.getPawn2Id(), cardId);

    Integer steps1 = chooseStepsForPawn1(a1, a2);
    if (steps1 == null) {
      return null;
    }
    int s1 = steps1;
    int s2 = 7 - s1;
    if (!isValidSplit(gs, request, cardId, s1, s2)) {
      return null;
    }
    return new int[] {s1, s2};
  }

  /** Chooses pawn1's step count: finish first (deepest), then blockade (furthest), else none. */
  private static Integer chooseStepsForPawn1(Analysis a1, Analysis a2) {
    // Finish takes priority: the pawn reaching deepest into the finish (by landing tile) wins.
    Integer finish = pickForWall(a1, a2, Kind.FINISH, Analysis::landingTileNr);
    if (finish != null) {
      return finish;
    }
    // Otherwise a blockade: the pawn that advances furthest against it (by step count) wins.
    return pickForWall(a1, a2, Kind.BLOCKADE, Analysis::bestSteps);
  }

  /**
   * If either pawn hits a wall of this {@code kind}, return pawn1's step allocation — favouring the
   * pawn with the higher {@code metric}, ties going to pawn1. Returns {@code null} when neither pawn
   * hits this kind of wall, so the caller can fall through to the next priority.
   */
  private static Integer pickForWall(
      Analysis a1, Analysis a2, Kind kind, ToIntFunction<Analysis> metric) {
    boolean hit1 = a1.kind() == kind;
    boolean hit2 = a2.kind() == kind;
    if (!hit1 && !hit2) {
      return null;
    }
    if (hit1 && (!hit2 || metric.applyAsInt(a1) >= metric.applyAsInt(a2))) {
      return a1.bestSteps();
    }
    return 7 - a2.bestSteps();
  }

  /** The step count whose landing is furthest forward, and how that landing is classified. */
  private static Analysis analyze(GameState gs, MoveRequest base, PawnId pawnId, int cardId) {
    Pawn pawn = gs.getPawn(pawnId);
    if (pawn == null) {
      return new Analysis(Kind.NONE, 0, -1);
    }
    // "Furthest forward" is measured along the route to the pawn's OWN finish — in team play the
    // mover is not the owner, because you play your teammate's pawns once your own are home.
    String ownerId = pawn.getPlayerId();
    int bestSteps = 0;
    int bestIndex = Integer.MIN_VALUE;
    int bestTileNr = -1;
    for (int steps = 1; steps <= 7; steps++) {
      MoveResponse resp = checkSingleMove(gs, base, pawnId, cardId, steps);
      if (!CAN_MAKE_MOVE.equals(resp.getResult())) {
        continue;
      }
      PositionKey landing = lastTile(resp.getMovePawn1());
      if (landing == null) {
        continue;
      }
      int index = forwardIndex(gs, ownerId, landing);
      if (index > bestIndex) {
        bestIndex = index;
        bestSteps = steps;
        bestTileNr = landing.getTileNr();
      }
    }
    if (bestSteps == 0) {
      return new Analysis(Kind.NONE, 0, -1);
    }
    if (bestTileNr >= FINISH_FIRST_TILE) {
      return new Analysis(Kind.FINISH, bestSteps, bestTileNr);
    }
    // The furthest landing was reached with fewer than 7 steps → more steps bounce off a wall.
    if (bestSteps < 7) {
      return new Analysis(Kind.BLOCKADE, bestSteps, bestTileNr);
    }
    return new Analysis(Kind.FREE, 7, bestTileNr);
  }

  private static boolean isValidSplit(
      GameState gs, MoveRequest base, int cardId, int steps1, int steps2) {
    MoveResponse m1 = checkSingleMove(gs, base, base.getPawn1Id(), cardId, steps1);
    if (!CAN_MAKE_MOVE.equals(m1.getResult())) {
      return false;
    }
    MoveResponse m2 = checkSingleMove(gs, base, base.getPawn2Id(), cardId, steps2);
    if (!CAN_MAKE_MOVE.equals(m2.getResult())) {
      return false;
    }
    PositionKey dest1 = lastTile(m1.getMovePawn1());
    PositionKey dest2 = lastTile(m2.getMovePawn1());
    return dest1 == null || !dest1.equals(dest2); // both pawns may not land on the same tile
  }

  /** Quick test of whether a pawn is close enough to a wall (finish or a blockaded start) to matter. */
  private static boolean mightHaveWall(GameState gs, PawnId pawnId) {
    Pawn pawn = gs.getPawn(pawnId);
    if (pawn == null) {
      return false;
    }
    PositionKey tile = pawn.getCurrentTileId();
    int tileNr = tile.getTileNr();
    if (tileNr >= FINISH_FIRST_TILE) {
      return true; // already on the finish — could go deeper or overshoot
    }
    // Whose last section this is depends on who owns the pawn, not on who is moving it.
    if (gs.isPawnOnLastSection(pawn.getPlayerId(), tile.getPlayerId()) && tileNr >= WALL_REACH_TILE) {
      return true; // close enough to enter its own finish
    }
    // close enough to reach the next section's start tile, and that tile is a blockade
    return tileNr >= WALL_REACH_TILE
        && gs.tileIsABlockade(new PositionKey(gs.nextPlayerId(tile.getPlayerId()), 0));
  }

  /**
   * A monotonic measure of how far forward a tile is along the pawn's path to its own finish:
   * board sections in travel order from its owner's own section, with the finish at the far end.
   * Higher = further forward.
   */
  private static int forwardIndex(GameState gs, String ownerId, PositionKey tile) {
    int tileNr = tile.getTileNr();
    if (tile.getPlayerId().equals(ownerId) && tileNr >= FINISH_FIRST_TILE) {
      // finish tiles continue straight after the last board section
      return gs.getNrPlayers() * TILES_PER_SECTION + (tileNr - FINISH_FIRST_TILE);
    }
    int order = 0;
    String section = ownerId;
    while (!section.equals(tile.getPlayerId()) && order <= 16) {
      section = gs.nextPlayerId(section);
      order++;
    }
    return order * TILES_PER_SECTION + tileNr;
  }

  private static MoveResponse checkSingleMove(
      GameState gs, MoveRequest base, PawnId pawnId, int cardId, int steps) {
    return MoveChecks.checkMove(gs, base.getPlayerId(), cardId, pawnId, steps);
  }

  private static PositionKey lastTile(List<PositionKey> move) {
    return (move == null || move.isEmpty()) ? null : move.get(move.size() - 1);
  }
}
