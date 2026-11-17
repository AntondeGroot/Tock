package adg.keezen.ApiTests;

import static org.junit.jupiter.api.Assertions.assertEquals;

import adg.keezen.ApiUtils.ApiUtil;
import adg.keezen.utils.ApiCallsHelper;
import adg.keezen.utils.BaseUnitTest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The server, not the client, decides what kind of move a request is: the steps are checked by
 * that kind, so a request cannot pick the looser rule by naming another one.
 */
class StepsMatchCardApiTest extends BaseUnitTest {

  private static final int SEVEN = 7;

  private final ApiCallsHelper api = new ApiCallsHelper();

  // Half of a split may be anything from 0 to 7 steps; a seven played whole must be 7. With one
  // pawn the server routes this as a normal move, whatever the request calls it.
  @Test
  void aSevenWalkingThreeStepsWithOnePawn_IsRefused_EvenWhenTheRequestCallsItASplit() {
    // GIVEN player 0 on turn, holding a seven, with a pawn on the board
    String sessionId = ApiUtil.createStandardGame();
    String player0 = ApiUtil.getPlayerid(sessionId, 0);
    api.setHandForPlayer(sessionId, player0, SEVEN);
    ApiUtil.setPawnPosition(sessionId, player0, 0, player0, 3);

    // WHEN that one pawn walks 3 steps with it, in a request that says it is a split
    Map<String, Object> response =
        api.makeMove(
            sessionId,
            player0,
            Map.of(
                "playerId", player0,
                "cardId", SEVEN, // a card's uuid is its value in setHandForPlayer
                "pawn1Id", Map.of("playerId", player0, "pawnNr", 0),
                "stepsPawn1", 3,
                "moveType", "split",
                "tempMessageType", "MAKE_MOVE"));

    // THEN it is refused, the pawn has not budged, and the seven is still in hand
    assertEquals("INVALID_SELECTION", response.get("result"));
    assertEquals(3, tileOfPawn(sessionId, player0, 0));
    assertEquals(List.of(SEVEN), cardValues(api.getPlayerCards(sessionId, player0)));
  }

  private static List<Object> cardValues(List<Map<String, Object>> cards) {
    return cards.stream().map(card -> card.get("value")).toList();
  }

  /** The tile a pawn stands on, read from the game state as every client reads it. */
  @SuppressWarnings("unchecked")
  private int tileOfPawn(String sessionId, String playerId, int pawnNr) {
    List<Map<String, Object>> pawns =
        (List<Map<String, Object>>) api.getGameState(sessionId).get("pawns");
    return pawns.stream()
        .filter(pawn -> pawn.get("pawnId").equals(Map.of("playerId", playerId, "pawnNr", pawnNr)))
        .map(pawn -> (Integer) ((Map<String, Object>) pawn.get("currentTileId")).get("tileNr"))
        .findFirst()
        .orElseThrow();
  }
}
