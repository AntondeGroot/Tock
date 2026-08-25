package adg.util;

import com.adg.openapi.model.Player;

public class PlayerStatus {
  public static boolean hasFinished(Player player) {
    Integer place = player.getPlace();
    if (place == null) {
      return false;
    }
    return place > 0;
  }

  /**
   * Whether this is an empty seat rather than someone playing: a seat that exists only to widen
   * the board. It owns a board section but has no pawns, cards, turn or colour.
   */
  public static boolean isPlaceholder(Player player) {
    Boolean placeholder = player.getPlaceholder();
    return placeholder != null && placeholder;
  }

  public static void setActive(Player player) {
    player.setIsActive(true);
  }

  public static void setInactive(Player player) {
    player.setIsActive(false);
  }
}
