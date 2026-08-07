package adg.keezen;

import com.adg.openapi.model.Card;
import com.adg.openapi.model.Player;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The players' hands plus the shared discard pile — the card storage both the real
 * {@link CardsDeck} and the {@link CardsDeckMock} keep. The decks differ only in how they build
 * and deal a deck; everything about holding, playing, trading and forfeiting cards lives here.
 */
class PlayerHands {

  private final HashMap<String, PlayerHand> hands = new HashMap<>();
  private final ArrayList<Card> playedCards = new ArrayList<>();

  /** True while the player is active and not yet placed (place &lt; 0 means no medal yet). */
  static boolean isDealtIn(Player player) {
    Boolean active = player.getIsActive();
    Integer place = player.getPlace();
    return active != null && active && place != null && place < 0;
  }

  void addPlayers(ArrayList<Player> players) {
    for (Player p : players) {
      hands.put(p.getId(), new PlayerHand());
    }
  }

  HashMap<String, Integer> nrOfCardsPerPlayer() {
    HashMap<String, Integer> nrOfCards = new HashMap<>();
    for (Map.Entry<String, PlayerHand> entry : hands.entrySet()) {
      nrOfCards.put(entry.getKey(), entry.getValue().getHand().size());
    }
    return nrOfCards;
  }

  /** This player's cards, or an empty list if they're not in the game. */
  ArrayList<Card> cardsOf(String playerId) {
    return hands.containsKey(playerId) ? handOf(playerId) : new ArrayList<>();
  }

  void giveCard(String playerId, Card card) {
    handOf(playerId).add(card);
  }

  boolean hasCard(String playerId, Card card) {
    return handOf(playerId).contains(card);
  }

  boolean hasCardsLeft(String playerId) {
    return !handOf(playerId).isEmpty();
  }

  void moveCard(String fromPlayerId, String toPlayerId, Card card) {
    handOf(fromPlayerId).remove(card);
    handOf(toPlayerId).add(card);
  }

  /** Play a card: take it out of the player's hand and put it on the pile. */
  void playFromHand(String playerId, Card card) {
    handOf(playerId).remove(card);
    playedCards.add(card);
  }

  /** Put a card on the pile without touching any hand (the mock's replay behaviour). */
  void discard(Card card) {
    playedCards.add(card);
  }

  /** Move the player's whole hand to the pile — they're out of this round. */
  void forfeit(String playerId) {
    playedCards.addAll(handOf(playerId));
    hands.get(playerId).dropCards();
  }

  /**
   * Test hook: replace the player's whole hand with {@code cards}. Unlike {@link #forfeit} the
   * discarded cards do NOT go to the pile — the point is to put a known hand on the table without
   * leaving any trace of the randomly dealt one.
   */
  void setHand(String playerId, List<Card> cards) {
    PlayerHand hand = hands.get(playerId);
    hand.dropCards();
    for (Card card : cards) {
      hand.addCard(card);
    }
  }

  /** Test hook: swap the player's first card for {@code card} (no-op removal on an empty hand). */
  void replaceFirstCard(String playerId, Card card) {
    if (!handOf(playerId).isEmpty()) {
      handOf(playerId).removeFirst();
    }
    handOf(playerId).addFirst(card);
  }

  void dropAllHands() {
    for (PlayerHand hand : hands.values()) {
      hand.dropCards();
    }
  }

  void clearPile() {
    playedCards.clear();
  }

  ArrayList<Card> playedCards() {
    return new ArrayList<>(playedCards);
  }

  void reset() {
    hands.clear();
    playedCards.clear();
  }

  private ArrayList<Card> handOf(String playerId) {
    return hands.get(playerId).getHand();
  }
}
