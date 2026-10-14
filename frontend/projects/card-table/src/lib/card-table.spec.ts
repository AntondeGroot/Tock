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

  describe('zones', () => {
    // A zone the game defines is somewhere a card can actually GO: a meld on a Rummikub table, the
    // stock in Pesten. The same element moves there — so the hand must stop drawing it at once,
    // even while the game still reports it in the hand, or the card shows in two places.
    it('moves a hand card into a zone the game defined, out of the hand', () => {
      // GIVEN a hand of two, and a meld zone laid out as a row in the middle of the table
      const a = card();
      const b = card();
      hand.set([a, b]);
      table.defineZone({ id: 'meld', layout: (index) => ({ x: 40 + index * 5, y: 50 }) });

      // WHEN the first card is placed in the meld
      table.place(a, 'meld');

      // THEN it is drawn in the meld's first slot
      expect(table.cards().find((c) => c.uuid === a.uuid)).toMatchObject({
        zoneId: 'meld',
        x: 40,
        y: 50,
      });
      // and the hand closes up around the card it still holds
      expect(table.cards().find((c) => c.uuid === b.uuid)).toMatchObject({
        zoneId: 'hand',
        x: positioner.handSlot(0, 1).x,
      });
    });

    // On a Rummikub table tiles are rearranged all the time: one taken off a meld goes to another.
    // It must leave the first meld — not be drawn in both — and that meld must close up behind it.
    // The move goes to the EARLIER-defined zone on purpose: a card left behind in a later zone
    // would win the layout there and still be drawn in the meld it was taken from.
    it('moves a card from one zone to another, closing up the zone it left', () => {
      // GIVEN two melds laid out as rows, the second holding three cards
      const [a, b, c] = [card(), card(), card()];
      table.defineZone({ id: 'meld-1', layout: (index) => ({ x: 10 + index * 5, y: 30 }) });
      table.defineZone({ id: 'meld-2', layout: (index) => ({ x: 10 + index * 5, y: 60 }) });
      [a, b, c].forEach((tile) => table.place(tile, 'meld-2'));

      // WHEN its middle card is moved to the first meld
      table.place(b, 'meld-1');

      // THEN it is drawn once, in the first meld
      expect(table.cards().filter((t) => t.uuid === b.uuid)).toEqual([
        expect.objectContaining({ zoneId: 'meld-1', x: 10, y: 30 }),
      ]);
      // and the second meld closes up: its last card moves into the gap
      expect(table.cards().find((t) => t.uuid === c.uuid)).toMatchObject({
        zoneId: 'meld-2',
        x: 15,
      });
    });

    // A zone id is a plain string, so a typo ('meld1' for 'meld-1') is easy to make. Taken out of
    // every zone and put in none, the card would just vanish from the table with nothing to say
    // why — so the mistake has to surface where it is made.
    it('refuses to place a card in a zone that was never defined', () => {
      // GIVEN a table with a meld zone, and a card in it
      const a = card();
      table.defineZone({ id: 'meld-1', layout: (index) => ({ x: index, y: 0 }) });
      table.place(a, 'meld-1');

      // WHEN the card is placed in a zone id that does not exist
      // THEN that fails, naming the zone
      expect(() => table.place(a, 'meld1')).toThrow("No zone 'meld1' on this table");
      // and the card stays where it was
      expect(table.cards().find((c) => c.uuid === a.uuid)).toMatchObject({ zoneId: 'meld-1' });
    });
  });

  describe('deal', () => {
    // Drawing in Rummikub takes a tile out of the pool on the table. Unlike Keezen's cards, which
    // appear from an unseen deck, the tile is already lying somewhere — so it must leave from its
    // own place in the pool, not from wherever the deck happens to be.
    it('deals a card from a zone the table holds, starting from its own slot there', () => {
      // GIVEN a pool of three tiles and an empty rack, both zones of the table
      const [a, b, c] = [card(), card(), card()];
      table.defineZone({ id: 'pool', layout: (index) => ({ x: 5 + index * 2, y: 10 }) });
      table.defineZone({ id: 'rack', layout: (index) => ({ x: 40 + index * 5, y: 90 }) });
      [a, b, c].forEach((tile) => table.place(tile, 'pool'));

      // WHEN the middle tile is dealt from the pool into the rack
      table.deal([b], { from: 'pool', into: 'rack' });

      // THEN it now belongs to the rack, but is first drawn at its slot in the pool
      expect(table.cards().find((t) => t.uuid === b.uuid)).toMatchObject({
        zoneId: 'rack',
        dealing: true,
        x: 7,
        y: 10,
      });

      // and on the next frame it is released towards its slot in the rack
      vi.advanceTimersByTime(50);
      expect(table.cards().find((t) => t.uuid === b.uuid)).toMatchObject({ x: 40, y: 90 });
    });

    // The hand is the game's: the server says which cards the viewer holds, and the table only
    // draws them. A deal into the hand must animate the cards in from the deck WITHOUT the table
    // taking hold of them — or a card the game later takes out of the hand would linger on screen.
    it('deals into the hand from the deck by default, leaving the cards to the game', () => {
      // GIVEN the game reports two freshly dealt cards in the hand
      const a = card();
      const b = card();
      hand.set([a, b]);

      // WHEN they are dealt without saying from where or into what
      table.deal([a, b]);

      // THEN both start on the deck, deck-sized, as hand cards
      const deck = positioner.pileCenter();
      expect(table.cards()).toEqual([
        expect.objectContaining({ uuid: a.uuid, zoneId: 'hand', x: deck.x, y: deck.y, scale: 0.3 }),
        expect.objectContaining({ uuid: b.uuid, zoneId: 'hand', x: deck.x, y: deck.y, scale: 0.3 }),
      ]);

      // WHEN the game then takes one of them out of the hand
      hand.set([b]);

      // THEN it is gone from the table — the deal kept no hold on it
      expect(table.cards().map((c) => c.uuid)).toEqual([b.uuid]);
    });
  });
});
