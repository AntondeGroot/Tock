import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardTable } from './card-table';
import { DEFAULT_LAYOUT } from './default-layout';
import { HAND_ZONE, PILE_ZONE } from './zone-layout';
import { CardFace } from './card-table.types';

// Card identity is the uuid; suit/value are the sprite. Reuse a small factory.
let uuid = 0;
const card = (value = 5, suit = 0): CardFace => ({ uuid: ++uuid, suit, value });

describe('CardTable', () => {
  const layout = DEFAULT_LAYOUT;
  let hand: ReturnType<typeof signal<CardFace[]>>;
  let table: CardTable;

  beforeEach(() => {
    uuid = 0;
    hand = signal<CardFace[]>([]);
    table = new CardTable({ hand });
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
      // slots come from the layout (fanned around x=50, y=116)
      expect(cards.map((c) => c.x)).toEqual([layout.hand(0, 2).x, layout.hand(1, 2).x]);
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
      expect(cards[0].x).toBeCloseTo(layout.pile(0, 1).x);
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
      const deck = layout.deck(0, 1);
      expect(table.cards()[0].x).toBeCloseTo(deck.x);
      expect(table.cards()[0].scale).toBeCloseTo(0.3);

      // after the double-rAF release they fan out to their real slots
      vi.advanceTimersByTime(50);
      expect(table.stacked()).toBe(false);
      expect(table.cards()[0].x).toBeCloseTo(layout.hand(0, 2).x);

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
    it('exposes resolved defaults, merges overrides, and reads the deck size from the layout', () => {
      const deck = () => ({ x: 52.5, y: 50, scale: 0.5 });
      const custom = new CardTable({ hand, layout: { ...layout, deck }, timing: { flyMs: 200 } });
      expect(custom.options.flyMs).toBe(200); // overridden
      expect(custom.options.dealStaggerMs).toBe(700); // default kept
      expect(custom.options.deckScale).toBe(0.5); // the deck's own size, for the layer
    });

    // Sizes live in the layout, and a slot that gives none is a full-size card — so a game whose
    // layout never mentions sizes deals and plays its cards at the size they are drawn in the hand.
    it('draws cards full size where the layout gives no size', () => {
      // GIVEN a layout whose pile and deck say nothing about size
      const unsized = {
        hand: layout.hand,
        pile: () => ({ x: 52, y: 50 }),
        deck: () => ({ x: 50, y: 50 }),
      };
      const plain = new CardTable({ hand, layout: unsized });
      const a = card();
      hand.set([a]);

      // WHEN a card is dealt from the deck
      plain.deal([a]);

      // THEN it starts on the deck full size, and the deck counts as full size for the layer
      expect(plain.cards().find((c) => c.uuid === a.uuid)!.scale).toBe(1);
      expect(plain.options.deckScale).toBe(1);

      // WHEN another card is played onto the pile
      plain.flyToPile({ suit: 0, value: 5, x: 0, y: 0 });
      vi.advanceTimersByTime(50);

      // THEN it flies toward the pile at full size
      expect(plain.flyers()[0].scale).toBe(1);
    });

    it('lands a flown card sooner when flyMs is shortened', () => {
      const custom = new CardTable({ hand, timing: { flyMs: 200 } });
      custom.flyToPile({ suit: 0, value: 5, x: 0, y: 0 });
      // Lands at flyMs(200) + the 100ms buffer = 300ms — well before the 600ms default.
      vi.advanceTimersByTime(200);
      expect(custom.pile()).toHaveLength(0);
      vi.advanceTimersByTime(120);
      expect(custom.pile()).toHaveLength(1);
    });
  });

  describe('zones', () => {
    // A game animating on its own — Keezen flying a traded card into the hand — aims at a slot
    // the table lays out. Asking the table, rather than keeping a copy of the layout, means the
    // game cannot aim at a place the table no longer draws the card.
    it("tells where any zone's slot lies, by the zone's id", () => {
      // GIVEN a table with a zone of the game's own
      table.defineZone({ id: 'meld', layout: (index) => ({ x: 40 + index * 5, y: 50 }) });

      // THEN each zone's slot is the one its layout gives: the hand's, the pile's, the game's
      expect(table.slotOf(HAND_ZONE, 1, 3)).toEqual(layout.hand(1, 3));
      expect(table.slotOf(PILE_ZONE, 2, 3)).toEqual(layout.pile(2, 3));
      expect(table.slotOf('meld', 2, 4)).toEqual({ x: 50, y: 50 });
    });

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
        x: layout.hand(0, 1).x,
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

    // Some zones hold cards no one may see: an opponent's hand, the stock in Pesten. The table
    // knows only that a card is there, so it must draw the back — whatever face it was given.
    it('draws the cards of a face-down zone with their backs up', () => {
      // GIVEN a face-down fan for an opponent, and a hand card of the viewer's own
      const own = card();
      const hidden = card();
      hand.set([own]);
      table.defineZone({ id: 'fan', faceDown: true, layout: (index) => ({ x: index, y: 0 }) });

      // WHEN a card is placed in the fan
      table.place(hidden, 'fan');

      // THEN it is drawn face down, while the viewer's own card still shows its face
      expect(table.cards().find((c) => c.uuid === hidden.uuid)).toMatchObject({ faceDown: true });
      expect(table.cards().find((c) => c.uuid === own.uuid)).toMatchObject({ faceDown: false });
    });

    // When an opponent plays, the server says WHICH card only as it leaves their hand: until then
    // the fan holds cards of no known face. The card turns over on its way to the pile — face known
    // from that moment — and lies there face up once the move is done.
    it('turns a card over as it moves from a face-down zone to a face-up one', () => {
      // GIVEN an opponent's face-down fan holding a card whose face is not known
      table.defineZone({ id: 'fan', faceDown: true, layout: (index) => ({ x: index, y: 0 }) });
      const unknown = { uuid: 100, suit: 0, value: 0 };
      table.place(unknown, 'fan');

      // WHEN it is played onto the pile, now known to be the jack of suit 2
      table.place({ uuid: 100, suit: 2, value: 11 }, 'pile');

      // THEN it shows that face, turning over from its back while it moves
      expect(table.cards().find((c) => c.uuid === 100)).toMatchObject({
        suit: 2,
        value: 11,
        faceDown: false,
        flip: 'in',
      });

      // and once the move is over it simply lies face up
      vi.advanceTimersByTime(500);
      expect(table.cards().find((c) => c.uuid === 100)).toMatchObject({ flip: null });
    });

    // The other way round: in a team trade the viewer gives a card from their own hand into the
    // teammate's fan. It is the viewer's card, so it starts face up — and turns its back to them
    // on the way, since a card in someone else's hand must not stay readable.
    it('turns a card face down as it moves from the hand into a face-down zone', () => {
      // GIVEN a card in the viewer's hand, and the teammate's face-down fan
      const given = card(9, 1);
      hand.set([given]);
      table.defineZone({ id: 'fan', faceDown: true, layout: (index) => ({ x: index, y: 0 }) });

      // WHEN the card is given into the fan
      table.place(given, 'fan');

      // THEN it lies face down there, turning its back while it moves
      expect(table.cards().find((c) => c.uuid === given.uuid)).toMatchObject({
        zoneId: 'fan',
        faceDown: true,
        flip: 'out',
      });
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
      const deck = layout.deck(0, 1);
      expect(table.cards()).toEqual([
        expect.objectContaining({ uuid: a.uuid, zoneId: 'hand', x: deck.x, y: deck.y, scale: 0.3 }),
        expect.objectContaining({ uuid: b.uuid, zoneId: 'hand', x: deck.x, y: deck.y, scale: 0.3 }),
      ]);

      // WHEN the game then takes one of them out of the hand
      hand.set([b]);

      // THEN it is gone from the table — the deal kept no hold on it
      expect(table.cards().map((c) => c.uuid)).toEqual([b.uuid]);
    });

    // A round is dealt to every seat at once — the viewer's hand, and each opponent's fan — so deals
    // overlap. A second deal must not touch the first: its cards are already on their way, and
    // drawing them back at the deck would make them jump there and fly out all over again.
    it('starts a second deal without sending the first one back to the deck', () => {
      // GIVEN a card dealt into the hand that has already left the deck
      const own = card();
      hand.set([own]);
      table.deal([own]);
      vi.advanceTimersByTime(50);
      const onItsWay = table.cards().find((c) => c.uuid === own.uuid)!;

      // WHEN a second card is dealt, into an opponent's fan
      table.defineZone({ id: 'fan', layout: (index) => ({ x: 80 + index, y: 5 }) });
      const theirs = card();
      table.deal([theirs], { into: 'fan' });

      // THEN the first card carries on from where it was, still being dealt
      expect(table.cards().find((c) => c.uuid === own.uuid)).toMatchObject({
        x: onItsWay.x,
        y: onItsWay.y,
        dealing: true,
      });
      // while the new one starts at the deck
      expect(table.cards().find((c) => c.uuid === theirs.uuid)).toMatchObject({
        x: layout.deck(0, 1).x,
        y: layout.deck(0, 1).y,
      });
    });

    // Overlapping deals also END apart: a deal of one card is over well before a deal of three
    // that began a moment later. Finishing the first must not end the second — its last cards
    // would stop being dealt mid-flight, and the game would take the deal for done too soon.
    it('ends each deal on its own time, not when another deal finishes', () => {
      // GIVEN one card dealt into the hand, and 50ms later three dealt into a fan
      const own = card();
      hand.set([own]);
      table.deal([own]);
      vi.advanceTimersByTime(50);
      table.defineZone({ id: 'fan', layout: (index) => ({ x: 80 + index, y: 5 }) });
      const theirs = [card(), card(), card()];
      table.deal(theirs, { into: 'fan' });

      // WHEN the one-card deal is over (1 × 700ms stagger + 2000ms), 2700ms after it began
      vi.advanceTimersByTime(2700 - 50);

      // THEN its card is no longer being dealt, but the fan's cards still are
      const dealing = (uuid: number) => table.cards().find((c) => c.uuid === uuid)!.dealing;
      expect(dealing(own.uuid)).toBe(false);
      expect(theirs.map((c) => dealing(c.uuid))).toEqual([true, true, true]);
      expect(table.dealing(), 'the table still counts as dealing').toBe(true);
    });

    // A round is dealt round-robin: every seat's first card, then every seat's second. Each seat
    // is its own deal, so the round is built from deals that start a beat apart — a later seat's
    // whole deal shifted back. That shift has to hold to the end, or its last card would stop
    // counting as dealt while it is still on its way.
    // Cards wait their turn on the deck before they fly. There they are part of a neat stack —
    // the tilt of the slot a card is headed for belongs to the slot, not to the deck. Taking it
    // early drew the waiting stack as a scatter of cards at every fan angle.
    it('keeps a dealt card squared up on the deck, tilting only as it goes to its slot', () => {
      // GIVEN a fan whose slots are tilted 30 degrees
      table.defineZone({ id: 'fan', layout: () => ({ x: 80, y: 5, rot: 30 }) });
      const a = card();

      // WHEN a card is dealt into it
      table.deal([a], { into: 'fan' });

      // THEN it waits on the deck squared up, like the deck itself
      expect(table.cards().find((c) => c.uuid === a.uuid)!.rot).toBe(0);
      // and takes its slot's tilt once it is released towards the slot
      vi.advanceTimersByTime(50);
      expect(table.cards().find((c) => c.uuid === a.uuid)!.rot).toBe(30);
    });

    it('shifts a whole deal later by its delay, ending later too', () => {
      // GIVEN a fan for the next seat round the table
      table.defineZone({ id: 'fan', layout: (index) => ({ x: 80 + index, y: 5 }) });
      const [a, b] = [card(), card()];

      // WHEN two cards are dealt into it 350ms behind the round
      table.deal([a, b], { into: 'fan', delayMs: 350 });

      // THEN each leaves on its turn (700ms apart), 350ms later
      const dealDelay = (uuid: number) => table.cards().find((c) => c.uuid === uuid)!.dealDelay;
      expect([dealDelay(a.uuid), dealDelay(b.uuid)]).toEqual([350, 1050]);

      // and the deal is still going after an undelayed one would be over (2 × 700ms + 2000ms)
      vi.advanceTimersByTime(3400 + 100);
      expect(table.dealing()).toBe(true);
      // until its own end, 350ms later
      vi.advanceTimersByTime(250);
      expect(table.dealing()).toBe(false);
    });
  });
});
