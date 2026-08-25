package adg.keezen;

import adg.util.Log;
import com.adg.openapi.model.GameOption;
import com.adg.openapi.model.GameOption.TypeEnum;
import java.util.List;
import java.util.Map;

/**
 * Single source of truth for all configurable Keezen game options.
 *
 * <p>To add a new option:
 * <ol>
 *   <li>Add a {@link GameOption} entry in {@link #all()}.
 *   <li>Add a {@code case} in {@link #applyOption} that maps the key to the corresponding
 *       {@link GameState} setter.
 * </ol>
 */
public class KeezenGameOptions {

  public static List<GameOption> all() {
    return List.of(
        new GameOption(
            "exactMoveRequired",
            "Exact move required",
            "When enabled, a pawn must land exactly on its destination. "
                + "Direction reversals are not allowed: bouncing off a blocked start tile "
                + "or overshooting the finish lane will be rejected as an illegal move.",
            TypeEnum.BOOLEAN,
            "true")
            .labelKey("gameOption.exactMoveRequired.label")
            .descriptionKey("gameOption.exactMoveRequired.description"),
        new GameOption(
            "mustPlayIfPossible",
            "Must play if possible",
            "When enabled, you cannot forfeit your turn if any valid move is available. "
                + "Pawns already in the finish are exempt — you are never required to move them.",
            TypeEnum.BOOLEAN,
            "true")
            .labelKey("gameOption.mustPlayIfPossible.label")
            .descriptionKey("gameOption.mustPlayIfPossible.description"),
        new GameOption(
            "cannotMoveOutOfFinish",
            "Cannot move out of the finish",
            "When enabled, a pawn that has reached the finish can never leave it again. "
                + "Only the four moves backwards, so this is what stops a four from pulling a "
                + "pawn back out of the finish onto the board.",
            TypeEnum.BOOLEAN,
            "true")
            .labelKey("gameOption.cannotMoveOutOfFinish.label")
            .descriptionKey("gameOption.cannotMoveOutOfFinish.description"),
        new GameOption(
            "twoPlayersOnFourSeats",
            "Two players on a four-seat board",
            "Two-player games only: play on a four-seat board instead of a two-seat one. The two "
                + "players sit opposite each other with an empty stretch of board between them — "
                + "twice the distance to travel, and no one waiting on those seats.",
            TypeEnum.BOOLEAN,
            "false")
            .labelKey("gameOption.twoPlayersOnFourSeats.label")
            .descriptionKey("gameOption.twoPlayersOnFourSeats.description"),
        new GameOption(
            "teamPlay",
            "Team play",
            "Play in teams of two: each player pairs with the player directly opposite, so the "
                + "table splits into pairs (8 players make 4 teams). Teammates help each other, and "
                + "a team wins once both members' pawns are all home.",
            TypeEnum.BOOLEAN,
            "true")
            .labelKey("gameOption.teamPlay.label")
            .descriptionKey("gameOption.teamPlay.description"),
        new GameOption(
            "teamCardTrade",
            "Ask teammate for a King or Ace",
            "Team play only: offer a card to your teammate and ask for a King or Ace to get a "
                + "pawn on the board. They hand one over (a two-way swap) or decline.",
            TypeEnum.BOOLEAN,
            "true")
            .labelKey("gameOption.teamCardTrade.label")
            .descriptionKey("gameOption.teamCardTrade.description")
    );
  }

  public static void apply(GameState gameState, Map<String, Object> options) {
    if (options == null || options.isEmpty()) return;
    for (Map.Entry<String, Object> entry : options.entrySet()) {
      applyOption(gameState, entry.getKey(), entry.getValue());
    }
  }

  private static void applyOption(GameState gameState, String key, Object value) {
    switch (key) {
      case "exactMoveRequired"    -> gameState.setExactMoveRequired(toBoolean(value));
      case "mustPlayIfPossible"   -> gameState.setMustPlayIfPossible(toBoolean(value));
      case "cannotMoveOutOfFinish" -> gameState.setCannotMoveOutOfFinish(toBoolean(value));
      case "twoPlayersOnFourSeats" -> gameState.setTwoPlayersOnFourSeats(toBoolean(value));
      case "teamPlay"             -> gameState.setTeamPlay(toBoolean(value));
      case "teamCardTrade"        -> gameState.setTeamCardTrade(toBoolean(value));
      default -> Log.info("KeezenGameOptions: unknown option key '" + key + "', ignoring");
    }
  }

  private static boolean toBoolean(Object value) {
    if (value instanceof Boolean b) return b;
    if (value instanceof String s) return Boolean.parseBoolean(s);
    return false;
  }
}