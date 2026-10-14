import { describe, expect, it } from 'vitest';
import { Zone } from './card-table.types';
import { placeCards } from './zone-layout';

/** A zone that lays its cards out in a row, each slot saying how many cards share the row. */
const row = (id: string, y: number): Zone => ({
  id,
  layout: (index, count) => ({ x: index, y, z: count }),
});
const card = (uuid: number) => ({ uuid, suit: 0, value: uuid });

describe('placeCards', () => {
  // The game reports some zones from its own state while the table moves cards on its own, so for
  // a moment a card can be listed twice: flown onto the pile, but still in the hand the server
  // last sent. It must be drawn once, in the zone it went to — and not leave a gap behind.
  it('puts a card listed in two zones in the later one, and closes up the earlier one', () => {
    // GIVEN a hand of three whose middle card has already gone to the pile
    const hand = { zone: row('hand', 0), cards: [card(1), card(2), card(3)] };
    const pile = { zone: row('pile', 9), cards: [card(2)] };

    // WHEN the table is laid out
    const placed = placeCards([hand, pile]);

    // THEN that card is placed once, on the pile
    expect(placed.filter((p) => p.card.uuid === 2)).toEqual([
      { card: card(2), zoneId: 'pile', pos: { x: 0, y: 9, z: 1 } },
    ]);
    // and the hand lays out as the two cards it still holds, side by side
    expect(placed.filter((p) => p.zoneId === 'hand').map((p) => [p.card.uuid, p.pos])).toEqual([
      [1, { x: 0, y: 0, z: 2 }],
      [3, { x: 1, y: 0, z: 2 }],
    ]);
  });
});
