import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Card as CardModel } from '../../../api';
import { CardTable } from '../../../card-table/card-table';
import { DefaultCardPositioner } from '../../../card-table/default-positioner';
import { BoardCardFly } from './board-card-fly';
import { buildBoard, fanCardBacks } from '../geometry/board-geometry';

// Real geometry (viewer = player 0) so the fan-slot maths matches the app.
const geo = buildBoard(
  [
    { id: '0', playerInt: 0 },
    { id: '1', playerInt: 1 },
    { id: '2', playerInt: 2 },
  ],
  '0',
);
const positioner = new DefaultCardPositioner();

describe('BoardCardFly', () => {
  let hand: CardModel[];
  let table: CardTable;
  let fly: BoardCardFly;

  beforeEach(() => {
    hand = [];
    table = new CardTable(() => hand, positioner);
    fly = new BoardCardFly(
      () => geo,
      () => hand,
      table,
      positioner,
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("flies an opponent's played card from its outermost fan slot, parsing suit_value", () => {
    const spy = vi.spyOn(table, 'flyToPile');
    fly.opponentPlayed('1', 3, ['2_13']);

    const slot = fanCardBacks(geo.deckSegment('1')!, 3).at(-1)!;
    expect(spy).toHaveBeenCalledWith(
      { suit: 2, value: 13, x: slot.x / 6, y: slot.y / 6, rot: slot.rotDeg },
      { startScale: 0.3, flip: 'in' },
    );
  });

  it('flies each discarded card on a forfeit, staggered, parsing each', () => {
    const spy = vi.spyOn(table, 'flyToPile');
    fly.opponentForfeit('1', 4, 2, ['9_1', '9_2', '1_5', '2_7']); // last 2 are discarded

    vi.advanceTimersByTime(0);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ suit: 1, value: 5 });

    vi.advanceTimersByTime(120);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toMatchObject({ suit: 2, value: 7 });
  });

  it('delegates a completed trade to the card table with the received/given slots', () => {
    const spy = vi.spyOn(table, 'tradeSwap');
    const other: CardModel = { uuid: 1, suit: 3, value: 4 };
    const received: CardModel = { uuid: 7, suit: 0, value: 13 };
    const given: CardModel = { uuid: 3, suit: 1, value: 1 };
    hand = [other, received]; // received lands at index 1 of a 2-card hand

    fly.tradeSwap('2', received, given);

    const seg = geo.deckSegment('2')!;
    const partner = { x: (seg[0].x + seg[1].x) / 12, y: (seg[0].y + seg[1].y) / 12 };
    expect(spy).toHaveBeenCalledWith(
      partner,
      { suit: 1, value: 1, from: positioner.handSlot(0, 1) },
      { uuid: 7, suit: 0, value: 13, to: positioner.handSlot(1, 2) },
    );
  });

  it('is a no-op without geometry', () => {
    const noGeo = new BoardCardFly(
      () => undefined,
      () => [],
      table,
      positioner,
    );
    const spy = vi.spyOn(table, 'flyToPile');
    noGeo.opponentPlayed('1', 3, ['2_13']);
    noGeo.opponentForfeit('1', 3, 1, ['2_13']);
    expect(spy).not.toHaveBeenCalled();
  });
});
