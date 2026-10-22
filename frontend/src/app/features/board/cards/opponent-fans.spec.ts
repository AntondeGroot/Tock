import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardTable, DEFAULT_LAYOUT } from 'ng-card-table';
import { OpponentFans } from './opponent-fans';
import { buildBoard, fanCardBacks } from '../geometry/board-geometry';

// Real geometry, seen by player 0, so the fan slots are the ones the board draws.
const VIEWER = '0';
const geo = buildBoard(
  [
    { id: '0', playerInt: 0 },
    { id: '1', playerInt: 1 },
    { id: '2', playerInt: 2 },
  ],
  VIEWER,
);

describe('OpponentFans', () => {
  let table: CardTable;
  let fans: OpponentFans;
  const inFan = (playerId: string) => table.cards().filter((c) => c.zoneId === `fan:${playerId}`);

  beforeEach(() => {
    table = new CardTable({ hand: () => [] });
    fans = new OpponentFans(() => geo, table, VIEWER);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // Opening the board mid-round — or reconnecting — the first push is the table as it stands, not
  // a deal: every opponent already holds their cards. Their fans must simply be there, face down,
  // without the deal animation replaying cards that were dealt long ago.
  it("lays out every opponent's hand face down on the first push, without dealing it", () => {
    // WHEN the first push says player 1 holds 5 cards and player 2 holds 3 (and the viewer 5)
    fans.reactToCounts({ '0': 5, '1': 5, '2': 3 }, []);

    // THEN each opponent's fan holds that many cards, all face down and none being dealt
    expect(inFan('1')).toHaveLength(5);
    expect(inFan('2')).toHaveLength(3);
    expect([...inFan('1'), ...inFan('2')].every((c) => c.faceDown && !c.dealing)).toBe(true);
    // at the slots of the fan the board draws for that seat, shrunk to the size of a back
    const slots = fanCardBacks(geo.deckSegment('1')!, 5).map((s) => ({
      x: s.x / 6,
      y: s.y / 6,
      rot: s.rotDeg,
      scale: 0.3,
    }));
    const drawnAt = inFan('1').map(({ x, y, rot, scale }) => ({ x, y, rot, scale }));
    expect(drawnAt).toEqual(expect.arrayContaining(slots));
    // and the viewer, whose own hand the game shows face up, gets no fan at all
    expect(inFan(VIEWER)).toEqual([]);
  });

  // A new round is dealt round-robin from the deck in the middle: the viewer's first card, then
  // the next seat's round the table, and so on — then everyone's second card. Each seat's cards
  // leave 350ms behind the seat before (seat 1 at 350ms, seat 2 at 700ms), 700ms per card.
  it("deals a new round into the opponents' fans round-robin, a beat behind per seat", () => {
    // GIVEN a table between rounds, every hand empty
    fans.reactToCounts({ '0': 0, '1': 0, '2': 0 }, []);

    // WHEN the next round gives everyone two cards
    fans.reactToCounts({ '0': 2, '1': 2, '2': 2 }, []);

    // THEN each opponent's cards are dealt, starting on the deck
    const deck = DEFAULT_LAYOUT.deck(0, 1);
    for (const card of [...inFan('1'), ...inFan('2')]) {
      expect(card).toMatchObject({ dealing: true, x: deck.x, y: deck.y });
    }
    // and leave on their seat's turn: player 1 sits next round the table, player 2 after them
    const delays = (playerId: string) =>
      inFan(playerId)
        .map((c) => c.dealDelay)
        .sort((a, b) => a - b);
    expect(delays('1')).toEqual([350, 1050]);
    expect(delays('2')).toEqual([700, 1400]);
  });

  // An opponent's play is only ever seen as their count dropping by one — and the card itself,
  // added to the public list of played cards as "suit_value". The card that leaves is the
  // outermost of their fan, and it turns over on its way, showing what was played on the pile.
  it("plays an opponent's outermost card onto the pile, turning it over to show what it was", () => {
    // GIVEN player 1 holding five cards
    fans.reactToCounts({ '0': 5, '1': 5, '2': 5 }, []);
    const outermost = fanCardBacks(geo.deckSegment('1')!, 5).at(-1)!;
    const leaving = inFan('1').find((c) => c.x === outermost.x / 6 && c.y === outermost.y / 6)!;

    // WHEN their count drops to four, with the jack of suit 2 added after the five played before
    fans.reactToCounts({ '0': 5, '1': 4, '2': 5 }, ['0_5', '2_11']);

    // THEN that outermost card is on the pile now, turning over to show the jack
    expect(table.cards().find((c) => c.uuid === leaving.uuid)).toMatchObject({
      zoneId: 'pile',
      suit: 2,
      value: 11,
      faceDown: false,
      flip: 'in',
    });
    // and the fan holds the other four
    expect(inFan('1')).toHaveLength(4);
  });

  // A reshuffle clears the server's pile in the very request that plays the round's last card, so
  // that push says the count dropped but lists no card to show. The card can't go to the pile
  // without a face — but it must not be forgotten either: a fan that lost track of a card it
  // still draws ends up one card too many once the next round is dealt into it.
  it('keeps a played card in the fan when the push lists no card played, so the deal adds none extra', () => {
    // GIVEN player 1 holding the round's last card
    fans.reactToCounts({ '0': 0, '1': 1, '2': 0 }, ['0_5']);

    // WHEN they play it as the pile is cleared, and the next round deals everyone five
    fans.reactToCounts({ '0': 0, '1': 0, '2': 0 }, []);
    fans.reactToCounts({ '0': 5, '1': 5, '2': 5 }, []);

    // THEN their fan holds the five they were dealt, not six
    expect(inFan('1')).toHaveLength(5);
  });

  // A forfeit throws the whole hand onto the pile — seen as the count dropping by more than one,
  // with every discarded card added to the played list. Thrown all at once they would land as a
  // single card; they go one after another, 120ms apart, so the pile reads as a run of discards
  // in the order the server lists them.
  it("discards an opponent's forfeited hand onto the pile one card at a time", () => {
    // GIVEN player 1 holding three cards, with one card played earlier this round
    fans.reactToCounts({ '0': 5, '1': 3, '2': 5 }, ['2_2']);

    // WHEN they forfeit: their count drops to none, and their three cards join the played list
    fans.reactToCounts({ '0': 5, '1': 0, '2': 5 }, ['2_2', '1_4', '0_7', '3_12']);

    // THEN their cards leave one by one, 120ms apart
    const onPile = () => table.cards().filter((c) => c.zoneId === 'pile');
    expect(onPile()).toHaveLength(0);
    vi.advanceTimersByTime(0);
    expect(onPile()).toHaveLength(1);
    vi.advanceTimersByTime(120);
    expect(onPile()).toHaveLength(2);
    vi.advanceTimersByTime(120);
    expect(onPile()).toHaveLength(3);
    // landing in the order the server played them, each turned over to its own face
    expect(table.pile().map((c) => `${c.suit}_${c.value}`)).toEqual(['1_4', '0_7', '3_12']);
    expect(inFan('1')).toEqual([]);
  });
});
