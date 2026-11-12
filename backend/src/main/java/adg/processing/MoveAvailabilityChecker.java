package adg.processing;

import static adg.util.BoardLogic.isPawnOnNest;
import static adg.util.BoardLogic.pawnIsOnNormalBoard;
import static com.adg.openapi.model.MoveResult.CAN_MAKE_MOVE;
import static com.adg.openapi.model.MoveType.SPLIT;
import static com.adg.openapi.model.MoveType.SWITCH;
import static com.adg.openapi.model.TempMessageType.CHECK_MOVE;

import adg.keezen.GameState;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Checks whether a player has at least one legal move available, for the
 * "must play if possible" game option.
 *
 * <p>Finish-lane pawns (tileNr >= 16) are deliberately excluded: a player is
 * never required to move them.
 *
 * <p>Each candidate is validated through the same processing path as a real
 * CHECK_MOVE request, so the result matches server-side move rules exactly.
 */
public class MoveAvailabilityChecker {

  public static boolean hasAvailableMove(GameState gs, String playerId, List<Card> cards) {
    List<Pawn> allPawns = gs.getPawns();

    // Every pawn this player may move: their own, plus a teammate's once all of their own are
    // home (team play). Filtering on ownership alone would leave them with nothing in that phase,
    // and so wrongly excuse them from the "must play if possible" rule.
    List<Pawn> playablePawns = allPawns.stream()
        .filter(p -> gs.mayControlPawn(playerId, p))
        .collect(Collectors.toList());

    List<Pawn> nestPawns = playablePawns.stream()
        .filter(p -> isPawnOnNest(p))
        .collect(Collectors.toList());

    List<Pawn> boardPawns = playablePawns.stream()
        .filter(p -> pawnIsOnNormalBoard(p))
        .collect(Collectors.toList());

    // The other half of a Jack switch: any board pawn — the pair is rejected by colour below.
    List<Pawn> allBoardPawns = allPawns.stream()
        .filter(p -> pawnIsOnNormalBoard(p))
        .collect(Collectors.toList());

    for (Card card : cards) {
      if (checkCard(gs, playerId, card, nestPawns, boardPawns, allBoardPawns)) {
        return true;
      }
    }
    return false;
  }

  private static boolean checkCard(
      GameState gs, String playerId, Card card,
      List<Pawn> nestPawns, List<Pawn> boardPawns, List<Pawn> allBoardPawns) {

    switch (card.getValue()) {
      case 13: // King — nest to start only
        for (Pawn pawn : nestPawns) {
          if (tryOnBoard(gs, playerId, card, pawn)) return true;
        }
        return false;

      case 1: // Ace — nest to start, or 1 step on board
        for (Pawn pawn : nestPawns) {
          if (tryOnBoard(gs, playerId, card, pawn)) return true;
        }
        for (Pawn pawn : boardPawns) {
          if (tryMove(gs, playerId, card, pawn, 1)) return true;
        }
        return false;

      case 11: // Jack — switch a board pawn you control with a board pawn of another colour
        for (Pawn own : boardPawns) {
          for (Pawn other : allBoardPawns) {
            if (own.getPlayerId().equals(other.getPlayerId())) continue;
            if (trySwitch(gs, playerId, card, own, other)) return true;
          }
        }
        return false;

      case 7: // Seven — full 7 steps, or any 1-6 / 6-1 split over a pair of board pawns
        for (Pawn pawn : boardPawns) {
          if (tryMove(gs, playerId, card, pawn, 7)) return true;
        }
        // Both orders of each pair: which pawn moves first can decide whether both get through.
        for (Pawn first : boardPawns) {
          for (Pawn second : boardPawns) {
            if (first == second) continue;
            for (int n = 1; n <= 6; n++) {
              if (trySplit(gs, playerId, card, first, second, n)) return true;
            }
          }
        }
        return false;

      default: // 2, 3, 4, 5, 6, 8, 9, 10
        int steps = card.getValue() == 4 ? -4 : card.getValue();
        for (Pawn pawn : boardPawns) {
          if (tryMove(gs, playerId, card, pawn, steps)) return true;
        }
        return false;
    }
  }

  /** A CHECK_MOVE request for playing {@code card} with {@code pawn1}; callers add move-type fields. */
  private static MoveRequest checkRequest(String playerId, Card card, Pawn pawn1) {
    MoveRequest req = new MoveRequest();
    req.setPlayerId(playerId);
    req.setCardId(card.getUuid());
    req.setPawn1Id(pawn1.getPawnId());
    req.setTempMessageType(CHECK_MOVE);
    return req;
  }

  private static boolean tryOnBoard(GameState gs, String playerId, Card card, Pawn pawn) {
    MoveRequest req = checkRequest(playerId, card, pawn);
    MoveResponse resp = new MoveResponse();
    ProcessOnBoard.process(gs, req, resp);
    return CAN_MAKE_MOVE.equals(resp.getResult());
  }

  private static boolean tryMove(GameState gs, String playerId, Card card, Pawn pawn, int steps) {
    return CAN_MAKE_MOVE.equals(checkMoveResponse(gs, playerId, card, pawn, steps).getResult());
  }

  private static boolean trySwitch(
      GameState gs, String playerId, Card card, Pawn own, Pawn opp) {
    MoveRequest req = checkRequest(playerId, card, own);
    req.setPawn2Id(opp.getPawnId());
    req.setMoveType(SWITCH);
    MoveResponse resp = new MoveResponse();
    ProcessOnSwitch.process(gs, req, resp);
    return CAN_MAKE_MOVE.equals(resp.getResult());
  }

  /**
   * A split of the 7 that moves {@code first} by {@code stepsFirst} and then {@code second} by the
   * rest, checked as the split itself is: the second pawn on the board as it is once the first
   * has moved.
   */
  private static boolean trySplit(
      GameState gs, String playerId, Card card, Pawn first, Pawn second, int stepsFirst) {
    MoveRequest req = checkRequest(playerId, card, first);
    req.setPawn2Id(second.getPawnId());
    req.setStepsPawn1(stepsFirst);
    req.setStepsPawn2(7 - stepsFirst);
    req.setMoveType(SPLIT);
    MoveResponse resp = new MoveResponse();
    ProcessOnSplit.process(gs, req, resp);
    return CAN_MAKE_MOVE.equals(resp.getResult());
  }

  private static MoveResponse checkMoveResponse(
      GameState gs, String playerId, Card card, Pawn pawn, int steps) {
    return MoveChecks.checkMove(gs, playerId, card.getUuid(), pawn.getPawnId(), steps);
  }
}