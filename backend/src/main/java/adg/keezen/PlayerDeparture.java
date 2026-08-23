package adg.keezen;

import adg.util.PlayerStatus;
import com.adg.openapi.model.Player;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/**
 * A player stops playing — by leaving, by forfeiting, or by running out of cards.
 *
 * <p>The three differ only in how much they take with them: leaving is permanent (pawns come off the
 * board and the id is remembered as a leaver, so a new round never deals them back in), while
 * forfeiting only ends the current round. All three hand the round mechanics to {@link TurnOrder},
 * which decides whether the turn simply moves on or the round rolls over.
 */
class PlayerDeparture {

  private final CardsDeckInterface cardsDeck;
  private final TradeManager tradeManager;
  private final PlayerRoster roster;
  private final PawnLocations pawnLocations;
  private final TurnOrder turnOrder;
  private final Set<String> leavers;
  private final AtomicLong version;

  PlayerDeparture(
      CardsDeckInterface cardsDeck,
      TradeManager tradeManager,
      PlayerRoster roster,
      PawnLocations pawnLocations,
      TurnOrder turnOrder,
      Set<String> leavers,
      AtomicLong version) {
    this.cardsDeck = cardsDeck;
    this.tradeManager = tradeManager;
    this.roster = roster;
    this.pawnLocations = pawnLocations;
    this.turnOrder = turnOrder;
    this.leavers = leavers;
    this.version = version;
  }

  /** The player quits for good: pawns off the board, and they sit out every following round. */
  void leaveGame(String playerId) {
    discardHandAndTrade(playerId);
    leavers.add(playerId);
    pawnLocations.removeAllFor(playerId);
    withPlayer(playerId, player -> {
      PlayerStatus.setInactive(player);
      player.setIsPlaying(false);
    });
    // Only hand off the turn if the player who left was actually on it.
    turnOrder.dropFromRound(playerId, playerId.equals(turnOrder.getPlayerIdTurn()));
    version.incrementAndGet();
  }

  /** The player is out for this round only — they are dealt back in on the next one. */
  void forfeit(String playerId) {
    withPlayer(playerId, PlayerStatus::setInactive);
    // A forfeiting player is always the one on turn, so the turn always moves on.
    turnOrder.dropFromRound(playerId, true);
    version.incrementAndGet();
  }

  /** Forfeit at the player's own request, which also costs them the hand they were holding. */
  void forfeitAndDiscardHand(String playerId) {
    discardHandAndTrade(playerId);
    forfeit(playerId);
    version.incrementAndGet();
  }

  private void discardHandAndTrade(String playerId) {
    cardsDeck.forfeitCardsForPlayer(playerId);
    tradeManager.cancelForDeparture(playerId);
  }

  /** Apply an action to the player with this id, if they're still in the game. */
  private void withPlayer(String playerId, Consumer<Player> action) {
    Player player = roster.findById(playerId);
    if (player != null) {
      action.accept(player);
    }
  }
}
