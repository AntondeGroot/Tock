package adg.keezen;

import static adg.util.PlayerStatus.hasFinished;
import static adg.util.PlayerStatus.setActive;

import com.adg.openapi.model.Player;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Whose turn it is, who is still active this round, and moving the turn on to the next active
 * player. Owns the two turn pointers and the round's active list. GameState drives it for lifecycle
 * (start / reset / clear) and asks it to advance the turn; extracted from GameState, which keeps
 * thin delegating methods for the public API.
 */
class TurnOrder {

  private String playerIdTurn;
  private String playerIdStartingRound;
  private final ArrayList<String> activePlayers = new ArrayList<>();

  private final List<Player> players;
  private final List<String> winners;
  private final Set<String> leavers;
  private final PlayerRoster roster;
  private final Runnable clearMustPlayBlocked;
  private final Runnable dealRoundCards;

  TurnOrder(
      List<Player> players,
      List<String> winners,
      Set<String> leavers,
      PlayerRoster roster,
      Runnable clearMustPlayBlocked,
      Runnable dealRoundCards) {
    this.players = players;
    this.winners = winners;
    this.leavers = leavers;
    this.roster = roster;
    this.clearMustPlayBlocked = clearMustPlayBlocked;
    this.dealRoundCards = dealRoundCards;
  }

  String getPlayerIdTurn() {
    return playerIdTurn;
  }

  void setPlayerIdTurn(String playerId) {
    playerIdTurn = playerId;
  }

  void removeActive(String playerId) {
    activePlayers.remove(playerId);
  }

  /** Open a round with the first seat as the sole player to move (game start and mid-game reset). */
  void resetToFirstPlayer() {
    if (players.isEmpty()) {
      return;
    }
    playerIdTurn = players.getFirst().getId();
    playerIdStartingRound = playerIdTurn;
    setPlayingPlayer(playerIdTurn);
  }

  /** Rebuild the active list: every player who hasn't finished or left, marked active. */
  void resetActivePlayers() {
    activePlayers.clear();
    for (Player player : players) {
      if (!hasFinished(player) && !leavers.contains(player.getId())) {
        setActive(player);
        activePlayers.add(player.getId());
      }
    }
  }

  void removeWinnersFromActive() {
    for (String winnerId : winners) {
      activePlayers.remove(winnerId);
    }
  }

  boolean allActivePlayersExhausted() {
    return players.stream().noneMatch(Player::getIsActive);
  }

  /** The round ran out of players to play, but not everyone has finished — deal a fresh round. */
  boolean roundIsOverButGameContinues() {
    return activePlayers.isEmpty() && winners.size() < players.size();
  }

  void nextRoundPlayer() {
    playerIdTurn = roster.nextPlayerId(playerIdStartingRound);
    playerIdStartingRound = playerIdTurn;
    if (!activePlayers.isEmpty() && !activePlayers.contains(playerIdTurn)) {
      nextRoundPlayer();
    }
    // todo: check if all players have finished
    setPlayingPlayer(playerIdTurn);
  }

  void nextActivePlayer() {
    playerIdTurn = roster.nextPlayerId(playerIdTurn);
    if (!activePlayers.isEmpty() && !activePlayers.contains(playerIdTurn)) {
      nextActivePlayer();
    } else if (activePlayers.contains(playerIdTurn)) {
      setPlayingPlayer(playerIdTurn);
    }
    // If activePlayers is empty, no one is set as playing (game is between rounds or over)
  }

  /** Open the next round: everyone still in play is active again, with fresh hands. */
  void startNewRound() {
    resetActivePlayers();
    dealRoundCards.run();
    nextRoundPlayer();
  }

  /**
   * Drop the player from the round: if that leaves no one active, start a fresh round; otherwise
   * remove them from the active list and, when {@code advanceTurn}, pass the turn to the next
   * active player.
   */
  void dropFromRound(String playerId, boolean advanceTurn) {
    if (allActivePlayersExhausted()) {
      startNewRound();
    } else {
      removeActive(playerId);
      if (advanceTurn) {
        nextActivePlayer();
      }
    }
  }

  /** Clear the round's active list (used when the game stops). */
  void clearActive() {
    activePlayers.clear();
  }

  /** Reset the turn pointers to a default seat id and clear the active list (used by tearDown). */
  void tearDownTo(String defaultId) {
    playerIdTurn = defaultId;
    playerIdStartingRound = defaultId;
    activePlayers.clear();
  }

  private void setPlayingPlayer(String playerId) {
    clearMustPlayBlocked.run();
    for (Player player : players) {
      player.setIsPlaying(player.getId().equals(playerId));
    }
  }
}
