package adg.services;

import adg.keezen.GameRegistry;
import adg.keezen.GameSession;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Test-only seeding hooks (/test/**). Gated behind the `test` Spring profile so these
 * endpoints exist for unit/IT tests and the Playwright E2E run, but NOT in production
 * (which starts with no active profile). Activated by SpringAppTestHelper (Java tests)
 * and via --spring.profiles.active=test when a backend is booted for E2E.
 */
@Profile("test")
@RestController
@RequestMapping("/test")
public class TestResetController {

  @PostMapping("/reset")
  public void resetGameState() {
    GameSession gameSession = GameRegistry.getGameOrThrow("123");
    gameSession.reset();
  }

  @PostMapping("/set-card/{playerId}/{cardValue}")
  public void setCardForPlayer(
      @PathVariable("playerId") String playerId,
      @PathVariable("cardValue") int cardValue) {
    GameSession gameSession = GameRegistry.getGameOrThrow("123");
    // Use cardValue as the UUID so the client can reliably round-trip it back in MoveRequest.
    // Works for both the real and mock card decks.
    Card card = new Card().value(cardValue).suit(0).uuid(cardValue);
    gameSession.getCardsDeck().giveCardToPlayerForTesting(playerId, card);
  }

  @PostMapping("/set-card/{sessionId}/{playerId}/{cardValue}")
  public void setCardForPlayer(
      @PathVariable("sessionId") String sessionId,
      @PathVariable("playerId") String playerId,
      @PathVariable("cardValue") int cardValue) {
    GameSession gameSession = GameRegistry.getGameOrThrow(sessionId);
    // Use cardValue as the UUID so the client can reliably round-trip it back in MoveRequest.
    // Works for both the real and mock card decks.
    Card card = new Card().value(cardValue).suit(0).uuid(cardValue);
    gameSession.getCardsDeck().giveCardToPlayerForTesting(playerId, card);
  }

  @PostMapping("/simulate-must-play-timeout/{sessionId}")
  public void simulateMustPlayTimeout(@PathVariable("sessionId") String sessionId) {
    GameSession gameSession = GameRegistry.getGameOrThrow(sessionId);
    gameSession.getGameState().setMustPlayBlockedSince(
        System.currentTimeMillis() - 4 * 60 * 1000L);
  }

  @PostMapping("/set-only-card/{sessionId}/{playerId}/{cardValue}")
  public void setOnlyCardForPlayer(
      @PathVariable("sessionId") String sessionId,
      @PathVariable("playerId") String playerId,
      @PathVariable("cardValue") int cardValue) {
    GameSession gameSession = GameRegistry.getGameOrThrow(sessionId);
    gameSession.getCardsDeck().forfeitCardsForPlayer(playerId);
    Card card = new Card().value(cardValue).suit(0).uuid(cardValue);
    gameSession.getCardsDeck().giveCardToPlayerForTesting(playerId, card);
  }

  /**
   * Replace a player's whole hand with the comma-separated {@code cardValues} (e.g. 1,3,7,9,13),
   * dropping the dealt hand without putting it on the pile. Unlike /set-card this pins every card,
   * which is what makes a screenshot of the board reproducible (the deck is shuffled at deal time).
   *
   * <p>Values must be distinct: the uuid is the value, matching the other hooks here, and the
   * client identifies cards by uuid. Suits cycle 0..3 so a seeded hand looks like a dealt one —
   * suit carries no game meaning.
   */
  @PostMapping("/set-hand/{sessionId}/{playerId}/{cardValues}")
  public void setHandForPlayer(
      @PathVariable("sessionId") String sessionId,
      @PathVariable("playerId") String playerId,
      @PathVariable("cardValues") int[] cardValues) {
    GameSession gameSession = GameRegistry.getGameOrThrow(sessionId);
    List<Card> hand = new ArrayList<>();
    for (int i = 0; i < cardValues.length; i++) {
      hand.add(new Card().value(cardValues[i]).suit(i % 4).uuid(cardValues[i]));
    }
    gameSession.getCardsDeck().setHandForTesting(playerId, hand);
  }

  @PostMapping("/start-game/{sessionId}")
  public void startGameWithoutShuffle(@PathVariable("sessionId") String sessionId) {
    GameSession gameSession = GameRegistry.getGameOrThrow(sessionId);
    gameSession.getGameState().start(false);
  }

  @PostMapping("/set-pawn/{sessionId}/{playerId}/{pawnNr}/{sectionOwnerId}/{tileNr}")
  public void setPawnPosition(
      @PathVariable("sessionId") String sessionId,
      @PathVariable("playerId") String playerId,
      @PathVariable("pawnNr") int pawnNr,
      @PathVariable("sectionOwnerId") String sectionOwnerId,
      @PathVariable("tileNr") int tileNr) {
    GameSession gameSession = GameRegistry.getGameOrThrow(sessionId);
    gameSession.getGameState().getPawns().stream()
        .filter(pawn -> pawn.getPlayerId().equals(playerId)
                     && pawn.getPawnId().getPawnNr() == pawnNr)
        .findFirst()
        .ifPresent(pawn -> pawn.setCurrentTileId(new PositionKey(sectionOwnerId, tileNr)));
  }
}
