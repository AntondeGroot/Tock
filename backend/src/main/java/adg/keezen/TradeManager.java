package adg.keezen;

import com.adg.openapi.model.Card;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;

/**
 * The team card-trade sub-game (game option "step 5"): a player asks their teammate for a King or
 * Ace, then names a card of their own to give in return. Extracted from GameState so the rules live in one small,
 * directly testable unit; GameState keeps thin public methods that delegate here. Collaborators
 * (deck, version counter, team/started status, teammate lookup, King/Ace test) are injected so this
 * class has no dependency on the rest of the game state.
 *
 * <p>Each team trades independently: pending offers are keyed by the (unordered) teammate pair, so
 * one team having an open request neither blocks nor is visible to any other team.
 */
class TradeManager {

  private volatile boolean enabled = false;
  // One pending offer per team, keyed by the canonical teammate-pair key (see teamKey).
  private final Map<String, TradeRequest> pendingByTeam = new ConcurrentHashMap<>();

  private final CardsDeckInterface cardsDeck;
  private final AtomicLong version;
  private final BooleanSupplier teamGameStarted;
  private final UnaryOperator<String> teammateResolver;
  private final Predicate<Card> isKingOrAce;

  TradeManager(
      CardsDeckInterface cardsDeck,
      AtomicLong version,
      BooleanSupplier teamGameStarted,
      UnaryOperator<String> teammateResolver,
      Predicate<Card> isKingOrAce) {
    this.cardsDeck = cardsDeck;
    this.version = version;
    this.teamGameStarted = teamGameStarted;
    this.teammateResolver = teammateResolver;
    this.isKingOrAce = isKingOrAce;
  }

  void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  boolean isEnabled() {
    return enabled;
  }

  /** The pending trade for this player's team, if any (so a viewer only sees their own team's). */
  TradeRequest getPendingFor(String playerId) {
    String key = teamKeyFor(playerId);
    return key == null ? null : pendingByTeam.get(key);
  }

  /** Clear all pending trades — called from GameState.stop()/reset(). */
  void clearPending() {
    pendingByTeam.clear();
  }

  /**
   * Whether `playerId` may open a trade right now: a started team game with the trade sub-option
   * on, no trade already pending for their team, the player has a teammate and cards, and — the
   * round's trade window — they have not yet played a card since the deal. (Independent of the
   * specific card they would offer, so the UI can enable/disable the "ask for a King/Ace" button.)
   */
  boolean canRequest(String playerId) {
    String key = teamKeyFor(playerId);
    return teamGameStarted.getAsBoolean()
        && enabled
        && key != null // has a teammate
        && !pendingByTeam.containsKey(key) // this team has no trade pending
        && cardsDeck.playerHasCardsLeft(playerId)
        && !cardsDeck.hasPlayedSinceDeal(playerId);
  }

  /**
   * A player asks their teammate for a King or Ace. The ask goes out at once, carrying no card:
   * the teammate sees it immediately, and the requester names what they give in a following
   * {@link #offer}. Allowed only when {@link #canRequest} holds.
   */
  boolean request(String requesterId) {
    if (!canRequest(requesterId)) {
      return false;
    }
    String teammate = teammateResolver.apply(requesterId);
    pendingByTeam.put(
        teamKey(requesterId, teammate), new TradeRequest(requesterId, teammate, null));
    version.incrementAndGet();
    return true;
  }

  /**
   * The requester names the card they give in return — or renames it, since picking again simply
   * replaces the standing offer. Only the requester of a pending trade may offer, and only a card
   * they actually hold.
   */
  boolean offer(String requesterId, Card offeredCard) {
    String key = teamKeyFor(requesterId);
    TradeRequest pending = key == null ? null : pendingByTeam.get(key);
    if (pending == null || !pending.getRequesterId().equals(requesterId)) {
      return false;
    }
    if (offeredCard == null || !cardsDeck.playerHasCard(requesterId, offeredCard)) {
      return false;
    }
    TradeRequest offered = pending.offering(offeredCard);
    if (offered.getAnsweredCard() != null) {
      return completeSwap(key, offered); // their half was already in — settle it now
    }
    pendingByTeam.put(key, offered);
    version.incrementAndGet();
    return true;
  }

  /**
   * The teammate hands over a King or Ace. They need not wait for the requester to have picked —
   * their half is simply held, and the swap goes through the moment the other half lands. Only the
   * addressed teammate may accept, and only with a King/Ace they actually hold.
   */
  boolean accept(String teammateId, Card kingOrAce) {
    String key = teamKeyFor(teammateId);
    TradeRequest pending = key == null ? null : pendingByTeam.get(key);
    if (pending == null || !pending.getTeammateId().equals(teammateId)) {
      return false;
    }
    if (kingOrAce == null
        || !isKingOrAce.test(kingOrAce)
        || !cardsDeck.playerHasCard(teammateId, kingOrAce)) {
      return false;
    }
    TradeRequest answered = pending.answering(kingOrAce);
    if (answered.getOfferedCard() == null) {
      // The ask reaches the teammate before the requester has picked, so hold this half and let
      // the swap settle when they do — nobody is made to wait on the other.
      pendingByTeam.put(key, answered);
      version.incrementAndGet();
      return true;
    }
    return completeSwap(key, answered);
  }

  /**
   * Both halves are on the table: swap them and clear the trade. Either player must still hold
   * their card — if one left or forfeited it was moved to the pile, and swapping it would
   * duplicate it (and sink the other's card into a discarded hand). Drop the stale trade rather
   * than corrupt the hands.
   */
  private boolean completeSwap(String key, TradeRequest trade) {
    String requesterId = trade.getRequesterId();
    String teammateId = trade.getTeammateId();
    Card offered = trade.getOfferedCard();
    Card answered = trade.getAnsweredCard();
    if (!cardsDeck.playerHasCard(requesterId, offered)
        || !cardsDeck.playerHasCard(teammateId, answered)) {
      pendingByTeam.remove(key);
      version.incrementAndGet();
      return false;
    }
    cardsDeck.moveCardBetweenHands(requesterId, teammateId, offered);
    cardsDeck.moveCardBetweenHands(teammateId, requesterId, answered);
    pendingByTeam.remove(key);
    version.incrementAndGet();
    return true;
  }

  /** The teammate declines (can't or won't); the trade clears with no swap. */
  boolean reject(String teammateId) {
    String key = teamKeyFor(teammateId);
    TradeRequest pending = key == null ? null : pendingByTeam.get(key);
    if (pending == null || !pending.getTeammateId().equals(teammateId)) {
      return false;
    }
    pendingByTeam.remove(key);
    version.incrementAndGet();
    return true;
  }

  /** The requester withdraws their pending offer. */
  boolean cancel(String requesterId) {
    String key = teamKeyFor(requesterId);
    TradeRequest pending = key == null ? null : pendingByTeam.get(key);
    if (pending == null || !pending.getRequesterId().equals(requesterId)) {
      return false;
    }
    pendingByTeam.remove(key);
    version.incrementAndGet();
    return true;
  }

  /** Drop any pending trade this player (leaving or forfeiting) is a party to. */
  void cancelForDeparture(String playerId) {
    pendingByTeam
        .values()
        .removeIf(
            p ->
                playerId.equals(p.getRequesterId()) || playerId.equals(p.getTeammateId()));
  }

  /** The canonical (order-independent) key for the team a player belongs to, or null if none. */
  private String teamKeyFor(String playerId) {
    String teammate = teammateResolver.apply(playerId);
    return teammate == null ? null : teamKey(playerId, teammate);
  }

  private String teamKey(String a, String b) {
    return a.compareTo(b) <= 0 ? a + ' ' + b : b + ' ' + a;
  }
}
