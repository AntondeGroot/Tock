import { Card as CardModel } from '../../../api';
import { CardTable, DECK_ZONE, HAND_ZONE } from 'card-table';
import { BoardGeometry, FAN_SCALE } from '../geometry/board-geometry';

/** A hand card with its live table position — what a flight to the pile starts from. */
type PlayedCardSlot = Parameters<CardTable['flyToPile']>[0];

/** Discards leave one at a time, so a forfeited hand reads as a sequence rather than a blur. */
const FORFEIT_STAGGER_MS = 120;

/**
 * Bridges Keezen board geometry to the generic {@link CardTable} animations for the viewer's own
 * cards: a play, a forfeit, and a completed team trade become the card-table's flyToPile /
 * tradeSwap calls. The other players' cards live on the table as face-down fans instead (see
 * opponent-fans.ts). This is game-specific glue the reusable card-table module leaves to the host.
 */
export class BoardCardFly {
  constructor(
    private readonly geometry: () => BoardGeometry | undefined,
    private readonly cardTable: CardTable,
  ) {}

  /**
   * The viewer's own card as it currently sits in their hand. Snapshot it BEFORE the move is sent:
   * by the time the server confirms, the push has already taken the card out of the hand, so this
   * is the only moment its slot can be read (ported from the GWT captureCardStartPos).
   */
  handSlotOf(card: CardModel | undefined): PlayedCardSlot | undefined {
    return card ? this.cardTable.cards().find((c) => c.uuid === card.uuid) : undefined;
  }

  /** Fly the viewer's accepted card from its snapshotted hand slot to the pile, popping as it goes. */
  ownPlay(from: PlayedCardSlot | undefined, card: CardModel | undefined): void {
    if (from) this.cardTable.flyToPile(from, { pop: true });
    else if (card) this.cardTable.pile.update((pile) => [...pile, card]);
  }

  /** Forfeit: fly every card still in the viewer's hand to the pile, staggered like an opponent's. */
  ownForfeit(): void {
    this.cardTable
      .cards()
      .filter((c) => c.zoneId === HAND_ZONE) // the viewer's own — not the opponents' fans
      .forEach((c, i) => setTimeout(() => this.cardTable.flyToPile(c), i * FORFEIT_STAGGER_MS));
  }

  /**
   * Animate a completed card trade for a participant: the card you `gave` flies out to your
   * teammate's fan, and the King/Ace you `received` flies in from it to its slot in your hand.
   * Only the two teammates run this (their hands changed); opponents see nothing.
   */
  tradeSwap(otherId: string, received: CardModel, given: CardModel): void {
    const g = this.geometry();
    if (!g) return;
    const seg = g.deckSegment(otherId);
    const fanMidpoint = seg
      ? { x: (seg[0].x + seg[1].x) / 12, y: (seg[0].y + seg[1].y) / 12 } // in board-% (/6)
      : this.cardTable.nextPositionIn(DECK_ZONE);
    const partner = { x: fanMidpoint.x, y: fanMidpoint.y, scale: FAN_SCALE };
    // The push already put the received card in the hand: it flies to where it lies there.
    const slot = this.cardTable.positionOf(received.uuid);
    if (!slot) return;
    const handAnchor = this.cardTable.slotOf(HAND_ZONE, 0, 1); // fan centre — where the given card starts

    this.cardTable.tradeSwap(
      partner,
      { suit: given.suit, value: given.value, from: handAnchor },
      { uuid: received.uuid, suit: received.suit, value: received.value, to: slot },
    );
  }
}
