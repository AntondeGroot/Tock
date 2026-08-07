package adg.keezen;

import com.adg.openapi.model.Card;
import com.adg.openapi.model.Player;
import java.util.*;

public class CardsDeck implements CardsDeckInterface {

  private static final int CARD_VALUES_PER_SUIT = 13; // Ace (1) .. King (13)
  private static final int SUITS = 4;
  private static final int FIRST_CARD_UUID = 100; // non-zero sentinel: a filled uuid is never 0/null
  private static final int CARDS_DEALT_FIRST_ROUND = 5;
  private static final int CARDS_DEALT_LATER_ROUNDS = 4;
  private static final int ROUNDS_BEFORE_RESHUFFLE = 3;

  private int roundNr;
  // Monotonic across reshuffles, so a card uuid is NEVER reused within a session. The client
  // identifies cards by uuid (and derives its hand by subtracting the discard pile); a reused uuid
  // would let a stale discard shadow a freshly dealt card, hiding it from the hand.
  private int uniqueCardNr = FIRST_CARD_UUID;
  private ArrayDeque<Card> cardsDeque = new ArrayDeque<>();
  private final PlayerHands hands = new PlayerHands();
  // Players who have played at least one card since the current round was dealt. The team card
  // trade (asking a teammate for a King/Ace) is only allowed until you play your first card, so
  // this resets on every deal and grows as players play.
  private final Set<String> playedSinceDeal = new HashSet<>();
  private GameState gameState;

  public CardsDeck() {}

  public void setGameState(GameState gameState) {
    this.gameState = gameState;
  }

  public void addPlayers(ArrayList<Player> players) {
    hands.addPlayers(players);
  }

  public HashMap<String, Integer> getNrOfCardsPerPlayer() {
    return hands.nrOfCardsPerPlayer();
  }

  public ArrayList<Card> getCardsForPlayer(String playerUUID) {
    return hands.cardsOf(playerUUID);
  }

  public void forfeitCardsForPlayer(String playerId) {
    hands.forfeit(playerId);
  }

  public void shuffleIfFirstRound() {
    if (roundNr != 0) {
      return;
    }

    ArrayList<Card> cards = new ArrayList<>();
    // One full suit of values per player (suits cycle 0..3 when there are more than four players).
    // uuids continue from the running counter (not reset to FIRST_CARD_UUID) so they stay unique
    // across every reshuffle in this session.
    int nrPlayers = gameState.getActivePlayers().size();
    for (int suit = 0; suit < nrPlayers; suit++) {
      for (int cardValue = 1; cardValue <= CARD_VALUES_PER_SUIT; cardValue++) {
        cards.add(new Card().suit(suit % SUITS).value(cardValue).uuid(uniqueCardNr++));
      }
    }

    Collections.shuffle(cards);
    cardsDeque = new ArrayDeque<>(cards);
  }

  public void playCard(String playerId, Card card) {
    if (card == null) {
      return;
    }
    hands.playFromHand(playerId, card);
    playedSinceDeal.add(playerId); // closes this player's trade window for the round
  }

  public boolean hasPlayedSinceDeal(String playerId) {
    return playedSinceDeal.contains(playerId);
  }

  public boolean playerHasCardsLeft(String playerId) {
    return hands.hasCardsLeft(playerId);
  }

  public void giveCardToPlayerForTesting(String playerId, Card card) {
    // this way you can replace one card by another, play a card in a Test, and then know based on
    // the game whether the player should have 5 or 4 cards in their hand left.
    hands.replaceFirstCard(playerId, card);
  }

  public void setPlayerCard(String playerId, Card card) {
    hands.giveCard(playerId, card);
  }

  public void setHandForTesting(String playerId, List<Card> cards) {
    hands.setHand(playerId, cards);
  }

  public void dealCards() {
    int nrCards = roundNr == 0 ? CARDS_DEALT_FIRST_ROUND : CARDS_DEALT_LATER_ROUNDS;
    playedSinceDeal.clear(); // fresh hands → everyone may trade again this round
    if (roundNr == 0) {
      hands.clearPile(); // new round → reset the played-cards pile
    }

    // Hands should already be empty here (a fresh round is only dealt once every player is
    // inactive, and every path to inactive — forfeit, leave, win — drops that player's cards), but
    // clear them anyway so a deal always yields exactly nrCards regardless of any stray card.
    hands.dropAllHands();

    for (int j = 0; j < nrCards; j++) {
      for (Player player : gameState.getPlayers()) {
        if (PlayerHands.isDealtIn(player)) {
          hands.giveCard(player.getId(), cardsDeque.pop());
        }
      }
    }

    roundNr = (roundNr + 1) % ROUNDS_BEFORE_RESHUFFLE;
  }

  public boolean playerHasCard(String playerId, Card card) {
    return hands.hasCard(playerId, card);
  }

  public void moveCardBetweenHands(String fromPlayerId, String toPlayerId, Card card) {
    hands.moveCard(fromPlayerId, toPlayerId, card);
  }

  public boolean playerDoesNotHaveCard(String playerId, Card card) {
    return !playerHasCard(playerId, card);
  }

  public void reset() {
    roundNr = 0;
    cardsDeque.clear();
    hands.reset();
    playedSinceDeal.clear();
  }

  public ArrayList<Card> getPlayedCards() {
    return hands.playedCards();
  }
}
