package adg.processing;

import static adg.util.CardValueCheck.isJack;
import static com.adg.openapi.model.MoveResult.CANNOT_MAKE_MOVE;
import static com.adg.openapi.model.MoveResult.INVALID_SELECTION;
import static com.adg.openapi.model.MoveResult.PLAYER_DOES_NOT_HAVE_CARD;

import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResult;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import java.util.Optional;

/**
 * What a move has to satisfy before there is any point working out its route: a real pawn and card
 * were named, the pawn is on the board rather than in the nest, the player actually holds the card,
 * and the pawns are theirs to move.
 *
 * <p>Separate from the routing because these are questions about the REQUEST, answerable without
 * walking a single tile — and because a refusal here says nothing about the board's geometry.
 */
final class MovePreconditions {

  private MovePreconditions() {}

  /** Why a move was refused: the result to report, and the reason shown to the player. */
  record Refusal(MoveResult result, MoveRejectionReason reason) {}

  /** The refusal this move earns, or empty when it is worth routing. */
  static Optional<Refusal> check(GameState gs, MoveRequest request, Pawn pawn1, Card card) {
    if (pawn1 == null || card == null) {
      return refuse(INVALID_SELECTION, MoveRejectionReason.INVALID_SELECTION);
    }
    if (pawn1.getCurrentTileId().getTileNr() < 0) {
      return refuse(CANNOT_MAKE_MOVE, MoveRejectionReason.PAWN_ON_NEST);
    }
    if (!gs.playerHasCard(request.getPlayerId(), card)) {
      return refuse(PLAYER_DOES_NOT_HAVE_CARD, MoveRejectionReason.DONT_HAVE_CARD);
    }
    return checkPawnOwnership(gs, request, card);
  }

  /**
   * A Jack switches with someone else's pawn, so it is the one card allowed to name a pawn that is
   * not the player's. Otherwise both named pawns must be theirs to move — their own, or a
   * teammate's once all of their own are home.
   */
  private static Optional<Refusal> checkPawnOwnership(
      GameState gs, MoveRequest request, Card card) {
    if (isJack(card)) return Optional.empty();
    if (notControllable(gs, request.getPlayerId(), request.getPawn1Id())
        || notControllable(gs, request.getPlayerId(), request.getPawn2Id())) {
      return refuse(CANNOT_MAKE_MOVE, MoveRejectionReason.NOT_YOUR_PAWN);
    }
    return Optional.empty();
  }

  private static boolean notControllable(GameState gs, String playerId, PawnId pawnId) {
    return pawnId != null && !gs.mayControlPawn(playerId, gs.getPawn(pawnId));
  }

  private static Optional<Refusal> refuse(MoveResult result, MoveRejectionReason reason) {
    return Optional.of(new Refusal(result, reason));
  }
}
