package adg.keezen;

import com.adg.openapi.model.Card;
import com.adg.openapi.model.Player;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

public interface CardsDeckInterface {

  void addPlayers(ArrayList<Player> players);

  HashMap<String, Integer> getNrOfCardsPerPlayer();

  ArrayList<Card> getCardsForPlayer(String playerUUID);

  void forfeitCardsForPlayer(String playerId);

  void shuffleIfFirstRound();

  void playCard(String playerId, Card card);

  boolean playerHasCardsLeft(String playerId);

  /** Whether the player has played a card since the current round was dealt (closes their trade
   *  window — a team card trade is only allowed before you play your first card of the round). */
  boolean hasPlayedSinceDeal(String playerId);

  void giveCardToPlayerForTesting(String playerId, Card card);

  /**
   * Test hook: replace the player's whole hand with {@code cards}, dropping the dealt one without
   * putting it on the pile. Lets a test (or the README screenshot generator) pin an exact hand,
   * which {@code giveCardToPlayerForTesting} cannot — that only swaps the first card.
   */
  void setHandForTesting(String playerId, List<Card> cards);

  void setPlayerCard(String playerId, Card card);

  void dealCards();

  boolean playerHasCard(String playerId, Card card);

  /** Moves a single card from one player's hand to another's (used by the team card trade). */
  void moveCardBetweenHands(String fromPlayerId, String toPlayerId, Card card);

  void reset();

  ArrayList<Card> getPlayedCards();

  void setGameState(GameState gameState);
}
