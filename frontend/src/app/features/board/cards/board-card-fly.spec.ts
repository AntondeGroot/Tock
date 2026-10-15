import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Card as CardModel } from '../../../api';
import { CardTable, DEFAULT_LAYOUT } from 'card-table';
import { BoardCardFly } from './board-card-fly';
import { buildBoard } from '../geometry/board-geometry';

// Real geometry (viewer = player 0) so the fan-slot maths matches the app.
const geo = buildBoard(
  [
    { id: '0', playerInt: 0 },
    { id: '1', playerInt: 1 },
    { id: '2', playerInt: 2 },
  ],
  '0',
);
const layout = DEFAULT_LAYOUT;

describe('BoardCardFly', () => {
  let hand: CardModel[];
  let table: CardTable;
  let fly: BoardCardFly;

  beforeEach(() => {
    hand = [];
    table = new CardTable({ hand: () => hand });
    fly = new BoardCardFly(() => geo, table);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // Forfeiting throws away the viewer's OWN hand. The table holds more than that now — every
  // opponent's face-down fan lies on it too — and taking "every card not yet on the pile" for the
  // hand threw the opponents' cards onto the pile as well, as copies, with every forfeit.
  it("discards only the viewer's own hand on a forfeit, not the cards in other zones", () => {
    // GIVEN the viewer holding two cards, and an opponent's face-down fan holding one
    const own = [
      { uuid: 1, suit: 0, value: 5 },
      { uuid: 2, suit: 1, value: 9 },
    ];
    hand = own;
    table.defineZone({ id: 'fan:1', faceDown: true, layout: () => ({ x: 10, y: 10 }) });
    table.place({ uuid: -1_000_000, suit: 0, value: 0 }, 'fan:1');
    const spy = vi.spyOn(table, 'flyToPile');

    // WHEN the viewer forfeits, and every discard has had its turn
    fly.ownForfeit();
    vi.advanceTimersByTime(1000);

    // THEN only their own two cards were thrown onto the pile
    expect(spy.mock.calls.map(([card]) => card.uuid)).toEqual([1, 2]);
  });

  it('delegates a completed trade to the card table with the received/given slots', () => {
    const spy = vi.spyOn(table, 'tradeSwap');
    const other: CardModel = { uuid: 1, suit: 3, value: 4 };
    const received: CardModel = { uuid: 7, suit: 0, value: 13 };
    const given: CardModel = { uuid: 3, suit: 1, value: 1 };
    hand = [other, received]; // received lands at index 1 of a 2-card hand

    fly.tradeSwap('2', received, given);

    const seg = geo.deckSegment('2')!;
    // the partner's fan midpoint, carrying the size of a card in their fan
    const partner = { x: (seg[0].x + seg[1].x) / 12, y: (seg[0].y + seg[1].y) / 12, scale: 0.3 };
    expect(spy).toHaveBeenCalledWith(
      partner,
      { suit: 1, value: 1, from: layout.hand(0, 1) },
      { uuid: 7, suit: 0, value: 13, to: layout.hand(1, 2) },
    );
  });

  it('animates no trade without geometry', () => {
    const noGeo = new BoardCardFly(() => undefined, table);
    const spy = vi.spyOn(table, 'tradeSwap');
    noGeo.tradeSwap('2', { uuid: 7, suit: 0, value: 13 }, { uuid: 3, suit: 1, value: 1 });
    expect(spy).not.toHaveBeenCalled();
  });
});
