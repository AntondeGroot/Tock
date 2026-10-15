import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CardLayer } from './card-layer';
import { CardTable } from './card-table';
import { CardFace } from './card-table.types';
import { DEFAULT_LAYOUT } from './default-layout';

/**
 * A game that draws its own faces — a Rummikub tile: the number, in the colour of its suit. It
 * hands the layer an <ng-template>, which gets each card to draw.
 */
@Component({
  imports: [CardLayer],
  template: `
    <ng-template #tile let-face>
      <span class="tile" [attr.data-suit]="face.suit">{{ face.value }}</span>
    </ng-template>
    <ct-card-layer [table]="table" [face]="tile" />
  `,
})
class TileGame {
  readonly hand = signal<CardFace[]>([]);
  readonly table = new CardTable({ hand: this.hand });
}

/** A layer drawing `table`, as a game would put it on its page. */
function layerOf(table: CardTable) {
  const fixture = TestBed.createComponent(CardLayer);
  fixture.componentRef.setInput('table', table);
  return fixture;
}

/**
 * A table whose hand holds `inHand`, with a face-down fan holding `inFan` — an opponent's hand.
 */
function tableWith(inHand: CardFace[], inFan: CardFace[] = []): CardTable {
  const table = new CardTable({ hand: () => inHand });
  table.defineZone({ id: 'fan', faceDown: true, layout: (index) => ({ x: index, y: 0 }) });
  inFan.forEach((card) => table.place(card, 'fan'));
  return table;
}

describe('CardLayer', () => {
  // A flight lands on a timer; fake ones keep each test's flights from landing in the next.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // Rummikub's tiles are not playing cards: no sprite sheet holds them, and a game draws them
  // itself. The layer takes the game's own face for every card it draws face up, so the same
  // table — the zones, the flights, the deals — carries tiles as well as cards.
  it("draws each face-up card with the game's own face when it gives one", () => {
    // GIVEN a game that draws its faces itself, with a red 7 and a blue 12 to show
    const fixture = TestBed.createComponent(TileGame);
    fixture.componentInstance.hand.set([
      { uuid: 1, suit: 0, value: 7 },
      { uuid: 2, suit: 2, value: 12 },
    ]);

    // WHEN the layer draws them
    fixture.detectChanges();

    // THEN each card's front is the game's face, given that card
    const fronts = [...(fixture.nativeElement as HTMLElement).querySelectorAll('ct-card .front')];
    expect(
      fronts.map((front) => {
        const tile = front.querySelector('.tile');
        return [tile?.textContent?.trim(), tile?.getAttribute('data-suit')];
      }),
    ).toEqual([
      ['7', '0'],
      ['12', '2'],
    ]);
  });

  // A tile also travels: handed between teammates' racks, thrown onto the table. In flight it is
  // a flyer — a stand-in drawn above the table — and a stand-in that showed a playing card where a
  // tile left would give the flight away. Flyers wear the game's own face too.
  it("draws a flyer with the game's own face as well", () => {
    // GIVEN a game that draws its faces itself
    const fixture = TestBed.createComponent(TileGame);

    // WHEN a black 9 is in flight
    fixture.componentInstance.table.flyToPile({ suit: 3, value: 9, x: 40, y: 40 });
    fixture.detectChanges();

    // THEN the flyer's front is the game's face, given that tile
    const tile = (fixture.nativeElement as HTMLElement).querySelector('ct-card.flyer .front .tile');
    expect([tile?.textContent?.trim(), tile?.getAttribute('data-suit')]).toEqual(['9', '3']);
  });

  // The gold gleam tells the viewer "this card of yours does something special". An opponent's
  // face-down card has no face the viewer may know — the value it carries is a placeholder, or
  // worse, the real card — so lighting it up would announce what is in someone else's hand.
  it('never marks a face-down card as special, whatever value it carries', () => {
    // GIVEN a table with one card face up in the hand and one face down in a fan
    const table = tableWith([{ uuid: 1, suit: 0, value: 1 }], [{ uuid: 2, suit: 0, value: 1 }]);

    // WHEN a layer where every value counts as special draws it
    const fixture = layerOf(table);
    fixture.componentRef.setInput('isSpecial', () => true);
    fixture.detectChanges();

    // THEN only the face-up card gets the gleam
    const cards = [...(fixture.nativeElement as HTMLElement).querySelectorAll('ct-card.card')];
    expect(cards.map((c) => c.classList.contains('special'))).toEqual([true, false]);
  });

  // Clicking a card selects it and hovering one shows its hint — for the viewer's own cards. A
  // face-down card must give away nothing: hovering would report its value, and a game may well
  // hold a real one there (the card the viewer just gave a teammate). Hiding it from the mouse
  // with CSS is not enough, as that only stops the pointer; the layer itself must stay silent.
  it('reports clicks and hovers on face-up cards only', () => {
    // GIVEN a layer with a face-up seven in the hand and a face-down queen in a fan
    const fixture = layerOf(
      tableWith([{ uuid: 1, suit: 0, value: 7 }], [{ uuid: 2, suit: 0, value: 12 }]),
    );
    fixture.detectChanges();
    const clicked: number[] = [];
    const hovered: (number | null)[] = [];
    fixture.componentInstance.cardClick.subscribe((uuid) => clicked.push(uuid));
    fixture.componentInstance.cardHover.subscribe((value) => hovered.push(value));
    const [faceUp, faceDown] = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('ct-card.card'),
    ];

    // WHEN each is pointed at, clicked, and left
    for (const card of [faceUp, faceDown]) {
      card.dispatchEvent(new MouseEvent('mouseenter'));
      card.dispatchEvent(new MouseEvent('click'));
      card.dispatchEvent(new MouseEvent('mouseleave'));
    }

    // THEN only the face-up card is reported: its uuid on click, its value on hover, then null
    expect(clicked).toEqual([1]);
    expect(hovered).toEqual([7, null]);
  });

  // A card back is drawn with a 2px border — at the size it is mostly seen, stacked on the deck. The
  // layer reads that size from the table's deck slot; a game whose layout gives the deck no size
  // stacks full-size cards there, and their borders must not come out thinner than 2px.
  it("publishes the size of a card on the table's deck, full size when the layout gives none", () => {
    // GIVEN one table whose deck stacks cards at 0.3, and one whose deck says nothing about size
    const sized = new CardTable({ hand: () => [] });
    const unsized = new CardTable({
      hand: () => [],
      layout: { ...DEFAULT_LAYOUT, deck: () => ({ x: 50, y: 50 }) },
    });

    // WHEN a layer draws each
    const published = [sized, unsized].map((table) => {
      const fixture = layerOf(table);
      fixture.detectChanges();
      const layer = (fixture.nativeElement as HTMLElement).querySelector('.card-layer')!;
      return (layer as HTMLElement).style.getPropertyValue('--ct-deck-scale');
    });

    // THEN the backs are drawn against that size: the deck's own, else a full-size card
    expect(published).toEqual(['0.3', '1']);
  });

  // A flyer is a card's stand-in on the move — the viewer's own play swelling before it flies,
  // a traded card turning over between two hands. The layer draws each one where the engine says
  // it is, turning and glowing as its flight requires, apart from the cards at rest.
  it('draws each flyer at its place, turning and glowing as its flight says', () => {
    // GIVEN two flyers: one glowing on its way in, one turning its back on its way out
    const table = tableWith([]);
    table.flyToPile({ suit: 2, value: 11, x: 20, y: 30 }, { flip: 'in', pop: true });
    table.flyToPile({ suit: 0, value: 5, x: 60, y: 70 }, { flip: 'out' });
    const fixture = layerOf(table);

    // WHEN the layer draws them
    fixture.detectChanges();

    // THEN each is a flyer card at its own place, with its own turn and glow
    const flyers = [...(fixture.nativeElement as HTMLElement).querySelectorAll('ct-card.flyer')];
    expect(
      flyers.map((f) => ({
        left: (f as HTMLElement).style.left,
        top: (f as HTMLElement).style.top,
        flipIn: f.classList.contains('flip-in'),
        flipOut: f.classList.contains('flip-out'),
        glowing: f.classList.contains('popped'),
      })),
    ).toEqual([
      { left: '20%', top: '30%', flipIn: true, flipOut: false, glowing: true },
      { left: '60%', top: '70%', flipIn: false, flipOut: true, glowing: false },
    ]);
  });
});
