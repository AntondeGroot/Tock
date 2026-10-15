import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Card as CardModel } from '../../../api';
import { CardTable, DEFAULT_LAYOUT } from 'ng-card-table';
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
  // A signal, as the board's is: the table recomputes where cards lie when the hand changes.
  const hand = signal<CardModel[]>([]);
  let table: CardTable;
  let fly: BoardCardFly;

  beforeEach(() => {
    hand.set([]);
    table = new CardTable({ hand });
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
    hand.set(own);
    table.defineZone({ id: 'fan:1', faceDown: true, layout: () => ({ x: 10, y: 10 }) });
    table.place({ uuid: -1_000_000, suit: 0, value: 0 }, 'fan:1');
    const spy = vi.spyOn(table, 'flyToPile');

    // WHEN the viewer forfeits, and every discard has had its turn
    fly.ownForfeit();
    vi.advanceTimersByTime(1000);

    // THEN only their own two cards were thrown onto the pile
    expect(spy.mock.calls.map(([card]) => card.uuid)).toEqual([1, 2]);
  });

  // A trade swaps one card for another in the viewer's hand. The card they give flies out to their
  // teammate's fan from where it lay in the hand — not from the middle of the hand, which made it
  // seem to come from a card that stays. By the time the trade completes, the push has already
  // taken it out of the hand, so the board notes where the cards lay before handing on the push.
  it('flies the given card out from where it lay, and the received one in to where it lands', () => {
    // GIVEN the viewer holding the ace they will give and another card, noted before the push
    const given: CardModel = { uuid: 3, suit: 1, value: 1 };
    const other: CardModel = { uuid: 1, suit: 3, value: 4 };
    const received: CardModel = { uuid: 7, suit: 0, value: 13 };
    hand.set([given, other]);
    fly.noteHand();
    const spy = vi.spyOn(table, 'tradeSwap');

    // WHEN the push swaps the ace for a king, and the trade completes
    hand.set([other, received]);
    fly.tradeSwap('2', received, given);

    // THEN the ace leaves from its own place, first of two, for the teammate's fan
    const seg = geo.deckSegment('2')!;
    const partner = { x: (seg[0].x + seg[1].x) / 12, y: (seg[0].y + seg[1].y) / 12, scale: 0.3 };
    expect(spy).toHaveBeenCalledWith(
      partner,
      { suit: 1, value: 1, from: layout.hand(0, 2) },
      // and the king flies in to where it now lies: second of two
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
