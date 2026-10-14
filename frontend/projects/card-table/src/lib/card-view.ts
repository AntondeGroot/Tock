import { CardVM, Pos, ResolvedCardTableOptions } from './card-table.types';
import { PILE_ZONE, PlacedCard } from './zone-layout';

/** A card being dealt: its turn in the deal, and where it is dealt from. */
export interface DealtCard {
  order: number;
  start: Pos;
}

/** What the engine knows about the table this frame, beyond where each card belongs. */
export interface TableFrame {
  /** The freshly dealt cards, by uuid. */
  dealt: ReadonlyMap<number, DealtCard>;
  /** The first frame of a deal, when the dealt cards still sit where they are dealt from. */
  atDeck: boolean;
  hidden: ReadonlySet<number>;
  snapped: ReadonlySet<number>;
  options: ResolvedCardTableOptions;
}

/**
 * What the layer draws for a placed card: normally its slot, but a card being dealt starts where it
 * is dealt from — sized and stacked as part of the deck — and leaves on its turn in the deal.
 */
export function toCardVM({ card, zoneId, pos }: PlacedCard, frame: TableFrame): CardVM {
  const dealt = frame.dealt.get(card.uuid);
  const dealing = dealt !== undefined;
  // First frame of a deal: drawn at its start, so it has somewhere to transition from.
  const start = dealing && frame.atDeck ? dealt.start : undefined;
  const dealDelay = dealing ? dealt.order * frame.options.dealStaggerMs : 0;
  return {
    uuid: card.uuid,
    suit: card.suit,
    value: card.value,
    zoneId,
    inPile: zoneId === PILE_ZONE,
    x: start ? start.x : pos.x,
    y: start ? start.y : pos.y,
    rot: pos.rot ?? 0,
    scale: (start ?? pos).scale ?? 1, // deck-sized, then grows to its slot
    // While dealing, the sooner a card flies (lower delay) the higher it sits, so it's taken off
    // the TOP of the deck stack.
    z: dealing ? 400 - Math.round(dealDelay / 20) : pos.z,
    dealDelay,
    dealing,
    hidden: frame.hidden.has(card.uuid),
    snap: frame.snapped.has(card.uuid),
  };
}
