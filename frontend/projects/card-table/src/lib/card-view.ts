import { CardVM, Pos, ResolvedCardTableOptions } from './card-table.types';
import { PILE_ZONE, PlacedCard } from './zone-layout';

/** What the engine knows about the table this frame, beyond where each card belongs. */
export interface TableFrame {
  /** Each freshly dealt uuid's place in the deal order. */
  dealt: ReadonlyMap<number, number>;
  /** The first frame of a deal, when the dealt cards still sit stacked at the deck. */
  atDeck: boolean;
  deck: Pos;
  hidden: ReadonlySet<number>;
  snapped: ReadonlySet<number>;
  options: ResolvedCardTableOptions;
}

/**
 * What the layer draws for a placed card: normally its slot, but a card being dealt starts on the
 * deck, sized and stacked as part of it, and leaves on its turn in the deal.
 */
export function toCardVM({ card, zoneId, pos }: PlacedCard, frame: TableFrame): CardVM {
  const dealOrder = frame.dealt.get(card.uuid);
  const dealing = dealOrder !== undefined;
  const useDeck = dealing && frame.atDeck; // first frame of a deal renders at the deck
  const dealDelay = dealing ? dealOrder * frame.options.dealStaggerMs : 0;
  return {
    uuid: card.uuid,
    suit: card.suit,
    value: card.value,
    inPile: zoneId === PILE_ZONE,
    x: useDeck ? frame.deck.x : pos.x,
    y: useDeck ? frame.deck.y : pos.y,
    rot: pos.rot ?? 0,
    scale: useDeck ? frame.options.deckScale : (pos.scale ?? 1), // deck-sized then grows to hand
    // While dealing, the sooner a card flies (lower delay) the higher it sits, so it's taken off
    // the TOP of the deck stack.
    z: dealing ? 400 - Math.round(dealDelay / 20) : pos.z,
    dealDelay,
    dealing,
    hidden: frame.hidden.has(card.uuid),
    snap: frame.snapped.has(card.uuid),
  };
}
