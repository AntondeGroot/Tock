package adg.keezen;

import com.adg.openapi.model.Card;
import com.adg.openapi.model.Player;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

public class CardsDeckMock implements CardsDeckInterface {

  private static final int CARD_VALUES_PER_SUIT = 13; // Ace (1) .. King (13)
  private static final int ROUNDS_BEFORE_RESHUFFLE = 3;

  private int roundNr;
  private final PlayerHands hands = new PlayerHands();
  private final Set<String> playedSinceDeal = new HashSet<>();
  private GameState gameState;
  private final ArrayList<Card> allCardsFromAceToKing = all13Cards();

  public CardsDeckMock() {}

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
    // the cards are not random so you do not need to shuffle them
  }

  public void playCard(String playerId, Card card) {
    if (card == null) {
      return;
    }
    // Deliberately does NOT remove the card from the mocked hand — tests replay the same setup.
    hands.discard(card);
    playedSinceDeal.add(playerId);
  }

  public boolean playerHasCardsLeft(String playerId) {
    return hands.hasCardsLeft(playerId);
  }

  public boolean hasPlayedSinceDeal(String playerId) {
    return playedSinceDeal.contains(playerId);
  }

  public void giveCardToPlayerForTesting(String playerId, Card card) {
    hands.replaceFirstCard(playerId, card);
  }

  public void setPlayerCard(String playerId, Card card) {
    hands.giveCard(playerId, card);
  }

  public void setHandForTesting(String playerId, List<Card> cards) {
    hands.setHand(playerId, cards);
  }

  public void dealCards() {
    playedSinceDeal.clear();
    hands.clearPile();
    hands.dropAllHands();
    for (Player player : gameState.getPlayers()) {
      if (PlayerHands.isDealtIn(player)) {
        for (Card card : allCardsFromAceToKing) {
          hands.giveCard(player.getId(), card);
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

  public void reset() {
    roundNr = 0;
    hands.reset();
    playedSinceDeal.clear();
  }

  public ArrayList<Card> getPlayedCards() {
    return hands.playedCards();
  }

  private ArrayList<Card> all13Cards() {
    ArrayList<Card> all13Cards = new ArrayList<>();
    Random random = new Random();
    for (int cardValue = 1; cardValue <= CARD_VALUES_PER_SUIT; cardValue++) {
      all13Cards.add(new Card().suit(0).value(cardValue).uuid(random.nextInt()));
    }
    return all13Cards;
  }
}
