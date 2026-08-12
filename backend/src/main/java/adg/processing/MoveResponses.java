package adg.processing;

import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRejectionReason;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.MoveResult;

/**
 * Helpers for marking a {@link MoveResponse} as rejected. Each returns {@code false} so a guard
 * clause reads as {@code if (bad) return reject(response, result, reason);}.
 */
final class MoveResponses {

  private MoveResponses() {}

  static void reject(MoveResponse response, MoveResult result, MoveRejectionReason reason) {
    response.setResult(result);
    response.setRejectionReason(reason);
  }

  static void reject(
      MoveResponse response, MoveResult result, MoveRejectionReason reason, Integer detail) {
    response.setRejectionDetail(detail);
    reject(response, result, reason);
  }

  /**
   * Guard shared by the move processors: the player must still hold the card they're trying to
   * play. Rejects (and returns {@code false}) when they don't — e.g. the card was already played
   * and is now on the pile, so it can't be re-used even for a CHECK preview.
   */
  static boolean requireCardHeld(GameState gs, String playerId, Card card, MoveResponse response) {
    if (!gs.playerHasCard(playerId, card)) {
      reject(response, MoveResult.PLAYER_DOES_NOT_HAVE_CARD, MoveRejectionReason.DONT_HAVE_CARD);
      return false;
    }
    return true;
  }
}
