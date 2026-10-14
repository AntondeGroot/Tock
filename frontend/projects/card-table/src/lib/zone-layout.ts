import { CardFace, Pos, Zone } from './card-table.types';

/** The zones every table has: the viewer's hand, the pile cards are played onto, and the deck. */
export const HAND_ZONE = 'hand';
export const PILE_ZONE = 'pile';
export const DECK_ZONE = 'deck';

/** A zone and the cards it holds, in order. */
export interface ZoneContents {
  zone: Zone;
  cards: readonly CardFace[];
}

/** A card at its slot in the zone that holds it. */
export interface PlacedCard {
  card: CardFace;
  zoneId: string;
  faceDown: boolean;
  pos: Pos;
}

/**
 * Put every card at its slot in the zone that holds it.
 *
 * A card listed in more than one zone belongs to the LAST of them, and the earlier ones lay out
 * without it. The game reports some zones from its own state while the table moves cards on its
 * own, so the two disagree for a moment: a card already flown onto the pile is still in the hand
 * the server last sent. The pile is listed later, so it wins — and the hand closes up behind it.
 */
export function placeCards(contents: readonly ZoneContents[]): PlacedCard[] {
  const claimed = new Set<number>();
  const placed: PlacedCard[] = [];
  for (const { zone, cards } of [...contents].reverse()) {
    const own = cards.filter((c) => !claimed.has(c.uuid));
    own.forEach((card, i) => {
      claimed.add(card.uuid);
      placed.push({
        card,
        zoneId: zone.id,
        faceDown: zone.faceDown ?? false,
        pos: zone.layout(i, own.length),
      });
    });
  }
  return placed;
}
