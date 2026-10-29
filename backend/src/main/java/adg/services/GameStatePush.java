package adg.services;

import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.Trade;
import java.util.List;
import java.util.Map;

/**
 * Personalized SSE payload: standard game state fields plus the receiving player's
 * private card hand and public card counts for all players.
 */
public class GameStatePush {

  private String currentPlayerId;
  private List<Pawn> pawns;
  private List<Player> players;
  private List<String> winners;
  private long version;
  private MoveResponse lastMoveResponse;

  // Public card data (same for everyone)
  private List<String> playedCards;
  private Map<String, Integer> nrOfCardsPerPlayer;

  // Private card data (specific to the receiving player)
  private List<Card> playerCards;

  // Whether this player is allowed to forfeit their turn right now
  private boolean canForfeit = true;

  // Whether this player may open a team card trade right now (team game, trade option on, no trade
  // pending, has a teammate + cards, and hasn't yet played a card this round)
  private boolean canRequestTrade = false;

  // Whether the King/Ace team trade sub-option is enabled
  private boolean teamCardTrade = false;

  // Whether the exact-move option is on (the game rules describe the game being played)
  private boolean exactMoveRequired = false;

  // Every seated player has finished or left: the client returns to the game room
  private boolean gameOver = false;

  // The pending team card-trade, if any (null otherwise)
  private Trade trade;

  public String getCurrentPlayerId() { return currentPlayerId; }
  public void setCurrentPlayerId(String v) { currentPlayerId = v; }

  public List<Pawn> getPawns() { return pawns; }
  public void setPawns(List<Pawn> v) { pawns = v; }

  public List<Player> getPlayers() { return players; }
  public void setPlayers(List<Player> v) { players = v; }

  public List<String> getWinners() { return winners; }
  public void setWinners(List<String> v) { winners = v; }

  public long getVersion() { return version; }
  public void setVersion(long v) { version = v; }

  public MoveResponse getLastMoveResponse() { return lastMoveResponse; }
  public void setLastMoveResponse(MoveResponse v) { lastMoveResponse = v; }

  public List<String> getPlayedCards() { return playedCards; }
  public void setPlayedCards(List<String> v) { playedCards = v; }

  public Map<String, Integer> getNrOfCardsPerPlayer() { return nrOfCardsPerPlayer; }
  public void setNrOfCardsPerPlayer(Map<String, Integer> v) { nrOfCardsPerPlayer = v; }

  public List<Card> getPlayerCards() { return playerCards; }
  public void setPlayerCards(List<Card> v) { playerCards = v; }

  public boolean isCanForfeit() { return canForfeit; }
  public void setCanForfeit(boolean v) { canForfeit = v; }

  public boolean isCanRequestTrade() { return canRequestTrade; }
  public void setCanRequestTrade(boolean v) { canRequestTrade = v; }

  public boolean isTeamCardTrade() { return teamCardTrade; }
  public void setTeamCardTrade(boolean v) { teamCardTrade = v; }

  public boolean isExactMoveRequired() { return exactMoveRequired; }
  public void setExactMoveRequired(boolean v) { exactMoveRequired = v; }

  public boolean isGameOver() { return gameOver; }
  public void setGameOver(boolean v) { gameOver = v; }

  public Trade getTrade() { return trade; }
  public void setTrade(Trade v) { trade = v; }
}