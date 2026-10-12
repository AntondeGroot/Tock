package adg.services;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves the game's localized display name so the GameRoom can show it in its
 * game list without hard-coding a copy (single source of truth). The game is
 * "Keezenspel" in Dutch; each locale uses the local name of the Tock/Dog family.
 * English (Tock) is the fallback for any unknown locale.
 */
@RestController
public class GameNameController {

  private static final Map<String, String> NAMES = Map.of(
      "en", "Tock",
      "nl", "Keezen",
      "de", "Dog",
      "fr", "Jeu de Toc",
      "nb", "Tock",
      "it", "Toc");

  private static final String DEFAULT_LOCALE = "en";

  @GetMapping("/game-name")
  public GameName gameName(@RequestParam(value = "locale", required = false) String locale) {
    String key = locale == null ? DEFAULT_LOCALE : locale.toLowerCase();
    return new GameName(NAMES.getOrDefault(key, NAMES.get(DEFAULT_LOCALE)));
  }

  public record GameName(String name) {}
}