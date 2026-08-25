package adg.keezen.UnitTests;

import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.GameSession;
import adg.keezen.GameState;
import adg.keezen.KeezenGameOptions;
import com.adg.openapi.model.GameOption;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class KeezenGameOptionsTest {

  private GameState gameState;

  @BeforeEach
  void setUp() {
    gameState = new GameSession().getGameState();
  }

  // ── all() ─────────────────────────────────────────────────────────────────

  @Test
  void all_returnsSixOptions() {
    assertEquals(6, KeezenGameOptions.all().size());
  }

  @Test
  void all_containsTeamPlay() {
    boolean found = KeezenGameOptions.all().stream()
        .anyMatch(o -> "teamPlay".equals(o.getKey()));
    assertTrue(found);
  }

  @Test
  void all_containsTeamCardTrade() {
    boolean found = KeezenGameOptions.all().stream()
        .anyMatch(o -> "teamCardTrade".equals(o.getKey()));
    assertTrue(found);
  }

  @Test
  void all_containsExactMoveRequired() {
    boolean found = KeezenGameOptions.all().stream()
        .anyMatch(o -> "exactMoveRequired".equals(o.getKey()));
    assertTrue(found);
  }

  @Test
  void all_containsMustPlayIfPossible() {
    boolean found = KeezenGameOptions.all().stream()
        .anyMatch(o -> "mustPlayIfPossible".equals(o.getKey()));
    assertTrue(found);
  }

  @Test
  void all_optionsHaveLabelsAndDescriptions() {
    for (GameOption option : KeezenGameOptions.all()) {
      assertNotNull(option.getLabel(), "Option " + option.getKey() + " should have a label");
      assertNotNull(option.getDescription(), "Option " + option.getKey() + " should have a description");
    }
  }

  // ── apply() null / empty guards ───────────────────────────────────────────

  @Test
  void apply_nullOptions_doesNothing() {
    assertDoesNotThrow(() -> KeezenGameOptions.apply(gameState, null));
  }

  @Test
  void apply_emptyOptions_doesNothing() {
    assertDoesNotThrow(() -> KeezenGameOptions.apply(gameState, Map.of()));
  }

  // ── exactMoveRequired ─────────────────────────────────────────────────────

  @Test
  void apply_exactMoveRequired_stringTrue_setsTrue() {
    KeezenGameOptions.apply(gameState, Map.of("exactMoveRequired", "true"));
    assertTrue(gameState.isExactMoveRequired());
  }

  @Test
  void apply_exactMoveRequired_stringFalse_setsFalse() {
    gameState.setExactMoveRequired(true);
    KeezenGameOptions.apply(gameState, Map.of("exactMoveRequired", "false"));
    assertFalse(gameState.isExactMoveRequired());
  }

  @Test
  void apply_exactMoveRequired_booleanTrue_setsTrue() {
    KeezenGameOptions.apply(gameState, Map.of("exactMoveRequired", Boolean.TRUE));
    assertTrue(gameState.isExactMoveRequired());
  }

  @Test
  void apply_exactMoveRequired_booleanFalse_setsFalse() {
    gameState.setExactMoveRequired(true);
    KeezenGameOptions.apply(gameState, Map.of("exactMoveRequired", Boolean.FALSE));
    assertFalse(gameState.isExactMoveRequired());
  }

  // ── mustPlayIfPossible ────────────────────────────────────────────────────

  @Test
  void apply_mustPlayIfPossible_stringTrue_setsTrue() {
    KeezenGameOptions.apply(gameState, Map.of("mustPlayIfPossible", "true"));
    assertTrue(gameState.isMustPlayIfPossible());
  }

  @Test
  void apply_mustPlayIfPossible_stringFalse_setsFalse() {
    gameState.setMustPlayIfPossible(true);
    KeezenGameOptions.apply(gameState, Map.of("mustPlayIfPossible", "false"));
    assertFalse(gameState.isMustPlayIfPossible());
  }

  @Test
  void apply_mustPlayIfPossible_booleanTrue_setsTrue() {
    KeezenGameOptions.apply(gameState, Map.of("mustPlayIfPossible", Boolean.TRUE));
    assertTrue(gameState.isMustPlayIfPossible());
  }

  // ── cannotMoveOutOfFinish ─────────────────────────────────────────────────

  @Test
  void apply_cannotMoveOutOfFinish_stringTrue_setsTrue() {
    KeezenGameOptions.apply(gameState, Map.of("cannotMoveOutOfFinish", "true"));
    assertTrue(gameState.isCannotMoveOutOfFinish());
  }

  // ── twoPlayersOnFourSeats ─────────────────────────────────────────────────

  @Test
  void apply_twoPlayersOnFourSeats_stringTrue_setsTrue() {
    KeezenGameOptions.apply(gameState, Map.of("twoPlayersOnFourSeats", "true"));
    assertTrue(gameState.isTwoPlayersOnFourSeats());
  }

  // ── default / unknown key ─────────────────────────────────────────────────

  @Test
  void apply_unknownKey_doesNotThrow() {
    assertDoesNotThrow(() -> KeezenGameOptions.apply(gameState, Map.of("unknownOption", "value")));
  }

  // ── toBoolean: non-Boolean non-String value → false ───────────────────────

  @Test
  void apply_integerValue_treatedAsFalse() {
    gameState.setExactMoveRequired(true);
    KeezenGameOptions.apply(gameState, Map.of("exactMoveRequired", 42));
    assertFalse(gameState.isExactMoveRequired());
  }
}