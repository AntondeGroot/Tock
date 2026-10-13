import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardTable } from './card-table';
import { DefaultCardPositioner } from './default-positioner';
import { CardFace } from './card-table.types';

// Card identity is the uuid; suit/value are the sprite. Reuse a small factory.
let uuid = 0;
const card = (value = 5, suit = 0): CardFace => ({ uuid: ++uuid, suit, value });

describe('CardTable', () => {
  const positioner = new DefaultCardPositioner();
  let hand: ReturnType<typeof signal<CardFace[]>>;
  let table: CardTable;

  beforeEach(() => {
    uuid = 0;
    hand = signal<CardFace[]>([]);
    table = new CardTable(hand, positioner);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('cards computed (hand + pile layout)', () => {
    it('lays out every hand card at its fanned hand slot, none in the pile', () => {
      const a = card();
      const b = card();
      hand.set([a, b]);

      const cards = table.cards();
      expect(cards).toHaveLength(2);
      expect(cards.every((c) => !c.inPile)).toBe(true);
      // slots come from the positioner (fanned around x=50, y=116)
      expect(cards.map((c) => c.x)).toEqual([
        positioner.handSlot(0, 2).x,
        positioner.handSlot(1, 2).x,
      ]);
      expect(cards[0].y).toBe(116);
    });

    it('keeps DOM order stable (sorted by uuid) regardless of hand order', () => {
      const a = card(); // uuid 1
      const b = card(); // uuid 2
      hand.set([b, a]); // reversed
      expect(table.cards().map((c) => c.uuid)).toEqual([1, 2]);
    });

    it('marks a card as in the pile once it lands, and drops it from the hand fan', () => {
      const a = card();
      hand.set([a]);
      table.pile.set([a]);

      const cards = table.cards();
      expect(cards).toHaveLength(1); // not double-counted (hand ∪ pile by uuid)
      expect(cards[0].inPile).toBe(true);
      expect(cards[0].x).toBeCloseTo(positioner.pileSlot(0).x);
    });
  });

  describe('dealIn', () => {
    it('renders dealt cards stacked at the deck on the first frame, then releases them', () => {
      const a = card();
      const b = card();
      hand.set([a, b]);

      table.dealIn([a.uuid, b.uuid]);
      expect(table.dealing()).toBe(true);
      expect(table.stacked()).toBe(true);
      // first frame: at the deck centre, deck-sized
      const deck = positioner.pileCenter();
      expect(table.cards()[0].x).toBeCloseTo(deck.x);
      expect(table.cards()[0].scale).toBeCloseTo(0.3);

      // after the double-rAF release they fan out to their real slots
      vi.advanceTimersByTime(50);
      expect(table.stacked()).toBe(false);
      expect(table.cards()[0].x).toBeCloseTo(positioner.handSlot(0, 2).x);

      // and the deal state clears once the last card has landed
      vi.advanceTimersByTime(2 * 700 + 2000);
      expect(table.dealing()).toBe(false);
    });
  });

  describe('flyToPile', () => {
    it('spawns a flyer immediately, then lands it on the pile', () => {
      const a = card(9, 1);
      table.flyToPile({ ...a, x: 10, y: 20 });
      expect(table.flyers()).toHaveLength(1);
      expect(table.pile()).toHaveLength(0);

      vi.advanceTimersByTime(650); // straight fly = 600ms land
      expect(table.flyers()).toHaveLength(0);
      expect(table.pile()).toHaveLength(1);
      expect(table.pile()[0]).toMatchObject({ uuid: a.uuid, suit: 1, value: 9 });
    });

    // The flyer is a copy of the hand card, and the hand can keep showing the original for a while:
    // when a forfeit ends the round, the round's hand stays on screen until the next deal. Left
    // visible, the original sat in the hand beside its own flyer and then — the moment its uuid
    // reached the pile — slid there itself: two flights for one card.
    it('flies a hand card to the pile once: hidden while its flyer is up, then in place', () => {
      // GIVEN a hand of two, which stays on screen throughout
      const a = card();
      const b = card();
      hand.set([a, b]);
      const slotOfA = table.cards().find((c) => c.uuid === a.uuid)!;

      // WHEN the first card is sent to the pile
      table.flyToPile(slotOfA);

      // THEN the original is hidden at its own slot — the fan does not close up behind it
      const inFlight = table.cards().find((c) => c.uuid === a.uuid)!;
      expect(inFlight.hidden, 'shown beside its own flyer').toBe(true);
      expect(inFlight.x).toBe(slotOfA.x);

      // WHEN the flyer lands (500ms flight + 100ms landing buffer)
      vi.advanceTimersByTime(600);

      // THEN the card shows on the pile at once, without transitioning there from the hand
      const landed = table.cards().find((c) => c.uuid === a.uuid)!;
      expect(landed).toMatchObject({ inPile: true, hidden: false, snap: true });

      // and the next frame lets it transition normally again
      vi.advanceTimersByTime(50);
      expect(table.cards().find((c) => c.uuid === a.uuid)!.snap).toBe(false);
    });

    it('assigns a synthetic (negative) uuid to a faceless opponent card', () => {
      table.flyToPile({ suit: 2, value: 3, x: 0, y: 0 });
      vi.advanceTimersByTime(650);
      expect(table.pile()[0].uuid).toBeLessThan(0);
    });

    it('holds the pop beat before flying for the viewer own play', () => {
      table.flyToPile({ ...card(), x: 0, y: 0 }, { pop: true });
      // pop lands at POP_MS(180) + 600; not landed yet at 600
      vi.advanceTimersByTime(600);
      expect(table.pile()).toHaveLength(0);
      vi.advanceTimersByTime(250);
      expect(table.pile()).toHaveLength(1);
    });
  });

  describe('tradeSwap', () => {
    it('flies both cards, masks the received card until its flyer lands, and leaves the pile alone', () => {
      const got = card(13); // the King you receive lands in your hand
      hand.set([got]);
      const partner = { x: 30, y: 30 };

      table.tradeSwap(
        partner,
        { suit: 0, value: 1, from: { x: 50, y: 116 } },
        { uuid: got.uuid, suit: got.suit, value: got.value, to: { x: 60, y: 116 } },
      );

      // Two flyers in the air, and the received card is masked immediately.
      expect(table.flyers()).toHaveLength(2);
      expect(table.cards()[0].hidden).toBe(true);

      // Revealed a frame before the flight ends (560ms), still mid-air.
      vi.advanceTimersByTime(560);
      expect(table.cards()[0].hidden).toBe(false);

      // Both flyers land by 600ms and nothing was added to the pile (a swap, not a play).
      vi.advanceTimersByTime(100);
      expect(table.flyers()).toHaveLength(0);
      expect(table.pile()).toHaveLength(0);
    });
  });

  describe('clearPile', () => {
    it('empties the discard pile', () => {
      table.pile.set([card(), card()]);
      table.clearPile();
      expect(table.pile()).toHaveLength(0);
    });
  });

  describe('options', () => {
    it('exposes resolved defaults and merges overrides', () => {
      const custom = new CardTable(hand, positioner, { flyMs: 200, deckScale: 0.5 });
      expect(custom.options.flyMs).toBe(200); // overridden
      expect(custom.options.deckScale).toBe(0.5); // overridden
      expect(custom.options.dealStaggerMs).toBe(700); // default kept
    });

    it('lands a flown card sooner when flyMs is shortened', () => {
      const custom = new CardTable(hand, positioner, { flyMs: 200 });
      custom.flyToPile({ suit: 0, value: 5, x: 0, y: 0 });
      // Lands at flyMs(200) + the 100ms buffer = 300ms — well before the 600ms default.
      vi.advanceTimersByTime(200);
      expect(custom.pile()).toHaveLength(0);
      vi.advanceTimersByTime(120);
      expect(custom.pile()).toHaveLength(1);
    });
  });
});
