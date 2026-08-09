package adg.keezen;

import com.adg.openapi.model.Card;

/**
 * A pending team card-trade (step 5). The requester asks their teammate for a King or Ace; the
 * teammate accepts by handing over a King/Ace (the two cards are swapped) or rejects. Only one
 * trade is pending at a time per team.
 *
 * <p>Each half arrives on its own: {@code offeredCard} when the requester picks what they give,
 * {@code answeredCard} when the teammate commits a King or Ace. They may come in either order,
 * and either player may pick again — {@link #offering} / {@link #answering} replace their half —
 * until both are present and the swap goes through.
 */
public class TradeRequest {

  private final String requesterId;
  private final String teammateId;
  private final Card offeredCard;
  private final Card answeredCard;

  public TradeRequest(String requesterId, String teammateId, Card offeredCard) {
    this(requesterId, teammateId, offeredCard, null);
  }

  public TradeRequest(String requesterId, String teammateId, Card offeredCard, Card answeredCard) {
    this.requesterId = requesterId;
    this.teammateId = teammateId;
    this.offeredCard = offeredCard;
    this.answeredCard = answeredCard;
  }

  public String getRequesterId() {
    return requesterId;
  }

  public String getTeammateId() {
    return teammateId;
  }

  public Card getOfferedCard() {
    return offeredCard;
  }

  /** The King or Ace the teammate has committed, or null while they have not given one. */
  public Card getAnsweredCard() {
    return answeredCard;
  }

  /** The same trade with a different card on the table — the requester changed their mind. */
  public TradeRequest offering(Card card) {
    return new TradeRequest(requesterId, teammateId, card, answeredCard);
  }

  /** The same trade with a different King/Ace committed — the teammate changed theirs. */
  public TradeRequest answering(Card card) {
    return new TradeRequest(requesterId, teammateId, offeredCard, card);
  }
}
