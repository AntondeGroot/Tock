package adg.keezen.ApiTests;

import static adg.keezen.utils.ApiModelHelpers.getRandomRoomName;
import static org.junit.jupiter.api.Assertions.assertEquals;

import adg.keezen.ApiUtils.ApiUtil;
import adg.keezen.utils.ApiCallsHelper;
import adg.keezen.utils.BaseUnitTest;
import adg.keezen.utils.SimultaneousRequests;
import com.adg.openapi.model.Player;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * A fast double-click sends the same request twice, and the copies reach the server side by side.
 * Every request that changes a game must take effect once, and leave the game playable. Each test
 * sends COPIES at once rather than two, so that they are sure to overlap.
 */
class DoubleClickApiTest extends BaseUnitTest {

  /** With the game lock off, every test sending this many caught it in 10 runs out of 10. */
  private static final int COPIES = 10;
  /**
   * A split check moves a pawn and puts it back within microseconds; to hit that window, far more
   * copies must overlap. With the game lock off, 100 caught it in 8 runs out of 10. More catch it
   * more often, but 500 connections opened at once overflow the server's queue of connections
   * waiting to be accepted (on macOS) and are reset. GameLockFilterTest proves every endpoint takes
   * the lock without relying on timing; this is the second safety net.
   */
  private static final int SPLIT_CHECKS = 100;
  private static final int CARD = 5;
  private static final int KING = 13;

  private final ApiCallsHelper api = new ApiCallsHelper();

  // The bug fixed in #746: a double-clicked play of the last card. Both copies passed the turn
  // check and both took the card out of the hand, leaving it at -1 cards — after which every push,
  // refresh and leave for that player failed, and the game was stuck on their turn for good.
  @Test
  void playingTheLastCardManyTimesAtOnce_playsItOnce() {
    // GIVEN player 0 on turn, holding a single card, with a pawn on the board it can move
    String sessionId = ApiUtil.createStandardGame();
    String player0 = ApiUtil.getPlayerid(sessionId, 0);
    String player1 = ApiUtil.getPlayerid(sessionId, 1);
    api.setHandForPlayer(sessionId, player0, CARD);
    ApiUtil.setPawnPosition(sessionId, player0, 0, player0, 3);

    // WHEN that card is played many times at once
    List<Integer> statuses =
        SimultaneousRequests.post(
            "/moves/" + sessionId + "/" + player0, playCardJson(player0), COPIES);

    // THEN one play is accepted, and every other copy is refused: it is no longer their turn
    assertEquals(1, Collections.frequency(statuses, 200), "accepted: " + statuses);
    assertEquals(COPIES - 1, Collections.frequency(statuses, 400), "refused: " + statuses);
    // the card left the hand once, the pawn moved once, and the turn passed on once
    assertEquals(List.of(), api.getPlayerCards(sessionId, player0));
    assertEquals(3 + CARD, tileOfPawn(sessionId, player0, 0));
    assertEquals(player1, ApiUtil.getPlayerIdTurn(sessionId));
  }

  // Forfeiting throws the whole hand onto the pile and passes the turn on. Run twice side by side,
  // the hand would be thrown away twice and the turn passed on twice: the next player skipped.
  @Test
  void forfeitingManyTimesAtOnce_forfeitsOnce() {
    // GIVEN player 0 on turn, holding three cards
    String sessionId = ApiUtil.createStandardGame();
    String player0 = ApiUtil.getPlayerid(sessionId, 0);
    String player1 = ApiUtil.getPlayerid(sessionId, 1);
    api.setHandForPlayer(sessionId, player0, 2, 3, 4);

    // WHEN they forfeit many times at once
    List<Integer> statuses =
        SimultaneousRequests.delete("/cards/" + sessionId + "/" + player0, COPIES);

    // THEN one forfeit is accepted, and every other copy is refused: it is no longer their turn
    assertEquals(1, Collections.frequency(statuses, 200), "accepted: " + statuses);
    assertEquals(COPIES - 1, Collections.frequency(statuses, 400), "refused: " + statuses);
    // the three cards are on the pile once (as suit_value; set-hand gives suits 0, 1, 2), the hand
    // is empty, and the turn passed on once
    Map<String, Object> cards = api.getPubliclyAvailableCardInformation(sessionId);
    assertEquals(List.of("0_2", "1_3", "2_4"), cards.get("playedCards"));
    assertEquals(List.of(), api.getPlayerCards(sessionId, player0));
    assertEquals(player1, ApiUtil.getPlayerIdTurn(sessionId));
  }

  // While a 7 is being split, the client keeps asking whether the split is possible, to preview
  // where the pawns would land. Checking a split is not read-only: it moves the first pawn on the
  // real board, checks the second pawn from there, and puts the first back. Two checks side by
  // side can each save the other's temporary position as the one to restore — leaving the pawn
  // standing where nobody moved it.
  @Test
  void checkingASevenSplitManyTimesAtOnce_leavesThePawnsWhereTheyWere() {
    // GIVEN player 0 on turn, holding a 7, with two pawns on the board
    String sessionId = ApiUtil.createStandardGame();
    String player0 = ApiUtil.getPlayerid(sessionId, 0);
    api.setHandForPlayer(sessionId, player0, 7);
    ApiUtil.setPawnPosition(sessionId, player0, 0, player0, 3);
    ApiUtil.setPawnPosition(sessionId, player0, 1, player0, 10);

    // WHEN a split of the 7 over both pawns, 4 and 3, is checked many times at once
    List<Integer> statuses =
        SimultaneousRequests.post(
            "/moves/" + sessionId + "/" + player0 + "/test", splitSevenJson(player0), SPLIT_CHECKS);

    // THEN every check finds the split possible
    assertEquals(Collections.nCopies(SPLIT_CHECKS, 200), statuses);
    // and nothing changed: both pawns are where they were, the 7 is still in hand, still their turn
    assertEquals(3, tileOfPawn(sessionId, player0, 0));
    assertEquals(10, tileOfPawn(sessionId, player0, 1));
    assertEquals(List.of(7), cardValues(api.getPlayerCards(sessionId, player0)));
    assertEquals(player0, ApiUtil.getPlayerIdTurn(sessionId));
  }

  // Leaving throws the hand onto the pile, takes the pawns off the board, and hands the turn on if
  // it was theirs. Run twice side by side, the hand could be thrown away twice and the turn handed
  // on twice — the next player skipped, or the round rolled over with players still in it.
  @Test
  void leavingManyTimesAtOnce_leavesOnce() {
    // GIVEN player 0 on turn, holding three cards
    String sessionId = ApiUtil.createStandardGame();
    String player0 = ApiUtil.getPlayerid(sessionId, 0);
    String player1 = ApiUtil.getPlayerid(sessionId, 1);
    String player2 = ApiUtil.getPlayerid(sessionId, 2);
    api.setHandForPlayer(sessionId, player0, 2, 3, 4);

    // WHEN they leave many times at once
    List<Integer> statuses =
        SimultaneousRequests.delete(
            "/games/" + sessionId + "/players/" + player0, COPIES);

    // THEN every copy is answered as done: leaving is the same whether or not they had already left
    assertEquals(Collections.nCopies(COPIES, 204), statuses);
    // their cards are on the pile once, and the turn passed on once, to the next player
    Map<String, Object> cards = api.getPubliclyAvailableCardInformation(sessionId);
    assertEquals(List.of("0_2", "1_3", "2_4"), cards.get("playedCards"));
    assertEquals(player1, ApiUtil.getPlayerIdTurn(sessionId));
    // and only they have gone: the other two are still in the game
    assertEquals(
        Map.of(player0, false, player1, true, player2, true), activePerPlayer(sessionId));
  }

  // A trade's swap goes through on whichever half lands last. Two copies of that last half side by
  // side would both find the trade still open and both swap: the requester handed the King twice,
  // the teammate the offered card twice — one card, now in two hands.
  @Test
  void acceptingATradeManyTimesAtOnce_swapsOnce() {
    // GIVEN a team game where player 0 asked teammate player 2 for a King, offering a 5 for it
    String sessionId = createTeamTradeGame();
    String requester = ApiUtil.getPlayerIdByPlayerInt(sessionId, 0);
    String teammate = ApiUtil.getPlayerIdByPlayerInt(sessionId, 2);
    api.setHandForPlayer(sessionId, requester, CARD);
    api.setHandForPlayer(sessionId, teammate, KING);
    api.teamTrade(sessionId, tradeJson("REQUEST", requester, null));
    api.teamTrade(sessionId, tradeJson("OFFER", requester, CARD));

    // WHEN the teammate hands over their King many times at once
    List<Integer> statuses =
        SimultaneousRequests.post(
            "/trade/" + sessionId, tradeJson("ACCEPT", teammate, KING), COPIES);

    // THEN one hand-over is accepted, and every other copy is refused: the trade is already done
    assertEquals(1, Collections.frequency(statuses, 200), "accepted: " + statuses);
    assertEquals(COPIES - 1, Collections.frequency(statuses, 400), "refused: " + statuses);
    // and the cards swapped once: each holds the other's card, and only that one
    assertEquals(List.of(KING), cardValues(api.getPlayerCards(sessionId, requester)));
    assertEquals(List.of(CARD), cardValues(api.getPlayerCards(sessionId, teammate)));
  }

  // Joining a game is a click too. Seated twice, one person would take two seats: two turns per
  // round, two sets of pawns — and the game would count them as two players towards its maximum.
  @Test
  void joiningManyTimesAtOnce_seatsThePlayerOnce() {
    // GIVEN a game that has not started, with room for four
    String sessionId = api.createNewGame(getRandomRoomName(), 4);

    // WHEN the same player joins many times at once
    List<Integer> statuses =
        SimultaneousRequests.post(
            "/games/" + sessionId + "/players", "{\"id\":\"player0\",\"name\":\"Anna\"}", COPIES);

    // THEN one join is accepted, and every other copy is refused as already in the game (409)
    assertEquals(1, Collections.frequency(statuses, 201), "accepted: " + statuses);
    assertEquals(COPIES - 1, Collections.frequency(statuses, 409), "refused: " + statuses);
    // and they hold one seat
    List<Object> seated =
        api.getAllPlayersInGame(sessionId).stream().map(p -> p.get("id")).toList();
    assertEquals(List.of("player0"), seated);
  }

  // Starting seats the players, puts out their pawns and deals the first round. Run twice side by
  // side, the table would be laid out twice over: seats numbered twice, pawns put out twice, and a
  // second hand dealt on top of the first.
  @Test
  void startingManyTimesAtOnce_startsTheGameOnce() {
    // GIVEN a game with three players that has not started
    String sessionId = api.createNewGame(getRandomRoomName(), 3);
    for (int i = 0; i < 3; i++) {
      api.addPlayerToGame(sessionId, new Player("player" + i, "player" + i));
    }

    // WHEN it is started many times at once
    List<Integer> statuses = SimultaneousRequests.post("/games/" + sessionId, "", COPIES);

    // THEN one start is accepted, and every other copy is refused as already started (409)
    assertEquals(1, Collections.frequency(statuses, 200), "accepted: " + statuses);
    assertEquals(COPIES - 1, Collections.frequency(statuses, 409), "refused: " + statuses);
    // and the table is laid out once: three seats, four pawns each, and the first round's five cards
    // each
    List<Object> seats =
        api.getAllPlayersInGame(sessionId).stream().map(p -> p.get("playerInt")).sorted().toList();
    assertEquals(List.of(0, 1, 2), seats);
    assertEquals(12, ((List<?>) api.getGameState(sessionId).get("pawns")).size());
    Map<?, ?> handSizes =
        (Map<?, ?>) api.getPubliclyAvailableCardInformation(sessionId).get("nrOfCardsPerPlayer");
    assertEquals(Set.of(5), Set.copyOf(handSizes.values()), "hand sizes: " + handSizes);
  }

  // A room name names one game waiting for players: it is how they find each other's game. A
  // double-clicked "create" would put two games of that name in the lobby, and players would split
  // up between them.
  // Creating names no game yet, so it is not covered by the per-game lock like the requests above.
  @Test
  void creatingAGameManyTimesAtOnce_createsOneGameOfThatName() {
    // GIVEN a room name no game uses yet
    String roomName = getRandomRoomName();

    // WHEN a game of that name is created many times at once
    List<Integer> statuses =
        SimultaneousRequests.post(
            "/games", "{\"roomName\":\"" + roomName + "\",\"maxPlayers\":4}", COPIES);

    // THEN one game is created, and every other copy is refused as the name is taken (409)
    assertEquals(1, Collections.frequency(statuses, 201), "created: " + statuses);
    assertEquals(COPIES - 1, Collections.frequency(statuses, 409), "refused: " + statuses);
    // and the lobby lists one game of that name
    long listed =
        api.getAllGames().stream().filter(g -> roomName.equals(g.get("roomName"))).count();
    assertEquals(1, listed);
  }

  /** A started 4-player team game with card trading on: players 0 and 2 are one team. */
  private String createTeamTradeGame() {
    String sessionId =
        api.createNewGameWithOptions(
            getRandomRoomName(), 4, Map.of("teamPlay", true, "teamCardTrade", true));
    for (int i = 0; i < 4; i++) {
      api.addPlayerToGame(sessionId, new Player("player" + i, "player" + i));
    }
    api.startGameForTesting(sessionId);
    return sessionId;
  }

  /** A trade action; the card, if any, as set-hand gives a lone card: suit 0, uuid its value. */
  private static String tradeJson(String action, String playerId, Integer cardValue) {
    String card =
        cardValue == null
            ? ""
            : ",\"card\":{\"suit\":0,\"value\":%d,\"uuid\":%d}".formatted(cardValue, cardValue);
    return "{\"action\":\"%s\",\"playerId\":\"%s\"%s}".formatted(action, playerId, card);
  }

  /** Whether each player is still taking part, by id. */
  private Map<String, Object> activePerPlayer(String sessionId) {
    return api.getAllPlayersInGame(sessionId).stream()
        .collect(Collectors.toMap(p -> (String) p.get("id"), p -> p.get("isActive")));
  }

  /** A split of the 7 (its uuid is its value): 4 steps for pawn 0, 3 for pawn 1. */
  private static String splitSevenJson(String playerId) {
    return """
        {"playerId":"%1$s","cardId":7,
         "pawn1Id":{"playerId":"%1$s","pawnNr":0},"pawn2Id":{"playerId":"%1$s","pawnNr":1},
         "stepsPawn1":4,"stepsPawn2":3}"""
        .formatted(playerId);
  }

  private static List<Object> cardValues(List<Map<String, Object>> cards) {
    return cards.stream().map(card -> card.get("value")).toList();
  }

  /** A MAKE_MOVE that plays CARD (its uuid is its value) on the player's pawn 0. */
  private static String playCardJson(String playerId) {
    return """
        {"playerId":"%s","cardId":%d,"pawn1Id":{"playerId":"%s","pawnNr":0},
         "stepsPawn1":%d,"tempMessageType":"MAKE_MOVE"}"""
        .formatted(playerId, CARD, playerId, CARD);
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
