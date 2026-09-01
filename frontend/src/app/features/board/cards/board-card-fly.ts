import { Card as CardModel } from '../../../api';
import { CardTable } from '../../../card-table/card-table';
import { CardPositioner } from '../../../card-table/card-table.types';
import { BoardGeometry, fanCardBacks } from '../geometry/board-geometry';

/** A hand card with its live table position — what a flight to the pile starts from. */
type PlayedCardSlot = Parameters<CardTable['flyToPile']>[0];

/** Parse a public "suit_value" played-card string into its sprite coordinates. */
function parseCard(str: string): { suit: number; value: number } {
  const [suit, value] = str.split('_').map(Number);
  return { suit, value };
}

/** Discards leave one at a time, so a forfeited hand reads as a sequence rather than a blur. */
const FORFEIT_STAGGER_MS = 120;

/** A fanned card-back slot (board px) → the card-layer's %-space (board px / 6). */
function toLayerSlot(slot: { x: number; y: number; rotDeg: number }): {
  x: number;
  y: number;
  rot: number;
} {
  return { x: slot.x / 6, y: slot.y / 6, rot: slot.rotDeg };
}

/**
 * Bridges Keezen board geometry to the generic {@link CardTable} animations: it turns an opponent's
 * public play / forfeit (fan geometry + "suit_value" strings) and a completed team trade into the
 * card-table's flyToPile / tradeSwap calls. This is the game-specific glue the reusable card-table
 * module deliberately leaves to the host — the board detects the events and delegates here.
 */
export class BoardCardFly {
  constructor(
    private readonly geometry: () => BoardGeometry | undefined,
    private readonly hand: () => CardModel[],
    private readonly cardTable: CardTable,
    private readonly positioner: CardPositioner,
    private readonly viewerId: string | null,
  ) {}

  /**
   * Diff the public per-player card counts against the previous push and animate what the other
   * players did: a drop of exactly one is a play (that card flies from their fan to the pile),
   * while a bigger drop is a forfeit, which staggers its cards out instead. Their hands are only
   * ever known as counts, so this diff is the only way those events are visible at all.
   */
  reactToCounts(counts: Record<string, number>, played: string[]): void {
    const previous = this.previousCounts;
    this.previousCounts = { ...counts };
    if (!previous) return;

    for (const [playerId, remaining] of Object.entries(counts)) {
      if (playerId === this.viewerId || !(playerId in previous)) continue;
      const before = previous[playerId];
      const dropped = before - remaining;
      if (dropped === 1) this.opponentPlayed(playerId, before, played);
      else if (dropped > 1) this.opponentForfeit(playerId, before, dropped, played);
    }
  }

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
      .filter((c) => !c.inPile)
      .forEach((c, i) => setTimeout(() => this.cardTable.flyToPile(c), i * FORFEIT_STAGGER_MS));
  }

  /** Last push's public counts, so the next one can be read as a diff. */
  private previousCounts?: Record<string, number>;

  /** Animate an opponent's just-played card from its (outermost) fan slot to the pile. */
  opponentPlayed(playerId: string, fanCount: number, played: string[]): void {
    const segment = this.geometry()?.deckSegment(playerId);
    const last = played.at(-1);
    if (!segment || !last) return;
    const slot = fanCardBacks(segment, fanCount).at(-1); // the outermost card leaves
    if (!slot) return;
    // Back-sized start; leaves the fan face-down and turns over mid-flight to reveal at the pile.
    this.cardTable.flyToPile(
      { ...parseCard(last), ...toLayerSlot(slot) },
      { startScale: 0.3, flip: 'in' },
    );
  }

  /** Forfeit: fly all of an opponent's discarded cards from their fan to the pile, staggered. */
  opponentForfeit(playerId: string, fanCount: number, dropped: number, played: string[]): void {
    const segment = this.geometry()?.deckSegment(playerId);
    if (!segment) return;
    const fan = fanCardBacks(segment, fanCount);
    played.slice(-dropped).forEach((str, i) => {
      const slot = fan[i] ?? fan.at(-1);
      if (!slot) return;
      setTimeout(
        () => this.cardTable.flyToPile({ ...parseCard(str), ...toLayerSlot(slot) }),
        i * FORFEIT_STAGGER_MS,
      );
    });
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
    const partner = seg
      ? { x: (seg[0].x + seg[1].x) / 12, y: (seg[0].y + seg[1].y) / 12 } // fan midpoint in board-% (/6)
      : this.positioner.pileCenter();
    const hand = this.hand();
    const i = hand.findIndex((c) => c.uuid === received.uuid);
    const slot = this.positioner.handSlot(i, hand.length);
    const handAnchor = this.positioner.handSlot(0, 1); // fan centre — where the given card starts

    this.cardTable.tradeSwap(
      partner,
      { suit: given.suit, value: given.value, from: handAnchor },
      { uuid: received.uuid, suit: received.suit, value: received.value, to: slot },
    );
  }
}
