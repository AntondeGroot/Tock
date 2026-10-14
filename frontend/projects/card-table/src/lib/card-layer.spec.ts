import { describe, expect, it } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CardLayer } from './card-layer';
import { CardVM, Flyer } from './card-table.types';

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
    <app-card-layer [cards]="cards()" [flyers]="flyers()" [face]="tile" />
  `,
})
class TileGame {
  readonly cards = signal<CardVM[]>([]);
  readonly flyers = signal<Flyer[]>([]);
}

/** A card as the engine hands it to the layer, resting in the hand unless a test says otherwise. */
const cardVM = (overrides: Partial<CardVM>): CardVM => ({
  uuid: 1,
  suit: 0,
  value: 1,
  zoneId: 'hand',
  faceDown: false,
  inPile: false,
  x: 50,
  y: 50,
  rot: 0,
  scale: 1,
  z: undefined,
  dealDelay: 0,
  dealing: false,
  hidden: false,
  snap: false,
  flip: null,
  ...overrides,
});

describe('CardLayer', () => {
  // Rummikub's tiles are not playing cards: no sprite sheet holds them, and a game draws them
  // itself. The layer takes the game's own face for every card it draws face up, so the same
  // table — the zones, the flights, the deals — carries tiles as well as cards.
  it("draws each face-up card with the game's own face when it gives one", () => {
    // GIVEN a game that draws its faces itself, with a red 7 and a blue 12 to show
    const fixture = TestBed.createComponent(TileGame);
    fixture.componentInstance.cards.set([
      cardVM({ uuid: 1, suit: 0, value: 7 }),
      cardVM({ uuid: 2, suit: 2, value: 12 }),
    ]);

    // WHEN the layer draws them
    fixture.detectChanges();

    // THEN each card's front is the game's face, given that card
    const fronts = [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-card .front')];
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
    fixture.componentInstance.flyers.set([
      { id: 1, x: 40, y: 40, rot: 0, scale: 1, suit: 3, value: 9 },
    ]);
    fixture.detectChanges();

    // THEN the flyer's front is the game's face, given that tile
    const tile = (fixture.nativeElement as HTMLElement).querySelector(
      'app-card.flyer .front .tile',
    );
    expect([tile?.textContent?.trim(), tile?.getAttribute('data-suit')]).toEqual(['9', '3']);
  });

  // The gold gleam tells the viewer "this card of yours does something special". An opponent's
  // face-down card has no face the viewer may know — the value it carries is a placeholder, or
  // worse, the real card — so lighting it up would announce what is in someone else's hand.
  it('never marks a face-down card as special, whatever value it carries', () => {
    // GIVEN a layer where every value counts as special
    const fixture = TestBed.createComponent(CardLayer);
    fixture.componentRef.setInput('isSpecial', () => true);

    // WHEN it draws one card face up in the hand and one face down in a fan
    fixture.componentRef.setInput('cards', [
      cardVM({ uuid: 1 }),
      cardVM({ uuid: 2, zoneId: 'fan', faceDown: true }),
    ]);
    fixture.detectChanges();

    // THEN only the face-up card gets the gleam
    const cards = [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-card.card')];
    expect(cards.map((c) => c.classList.contains('special'))).toEqual([true, false]);
  });

  // Clicking a card selects it and hovering one shows its hint — for the viewer's own cards. A
  // face-down card must give away nothing: hovering would report its value, and a game may well
  // hold a real one there (the card the viewer just gave a teammate). Hiding it from the mouse
  // with CSS is not enough, as that only stops the pointer; the layer itself must stay silent.
  it('reports clicks and hovers on face-up cards only', () => {
    // GIVEN a layer with a face-up seven in the hand and a face-down queen in a fan
    const fixture = TestBed.createComponent(CardLayer);
    fixture.componentRef.setInput('cards', [
      cardVM({ uuid: 1, value: 7 }),
      cardVM({ uuid: 2, value: 12, zoneId: 'fan', faceDown: true }),
    ]);
    fixture.detectChanges();
    const clicked: number[] = [];
    const hovered: (number | null)[] = [];
    fixture.componentInstance.cardClick.subscribe((uuid) => clicked.push(uuid));
    fixture.componentInstance.cardHover.subscribe((value) => hovered.push(value));
    const [faceUp, faceDown] = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('app-card.card'),
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

  // A flyer is a card's stand-in on the move — the viewer's own play swelling before it flies,
  // a traded card turning over between two hands. The layer draws each one where the engine says
  // it is, turning and glowing as its flight requires, apart from the cards at rest.
  it('draws each flyer at its place, turning and glowing as its flight says', () => {
    // GIVEN two flyers: one glowing on its way in, one turning its back on its way out
    const fixture = TestBed.createComponent(CardLayer);
    fixture.componentRef.setInput('flyers', [
      { id: 1, x: 20, y: 30, rot: 0, scale: 1, suit: 2, value: 11, flip: 'in', glow: true },
      { id: 2, x: 60, y: 70, rot: 0, scale: 0.3, suit: 0, value: 5, flip: 'out' },
    ]);

    // WHEN the layer draws them
    fixture.detectChanges();

    // THEN each is a flyer card at its own place, with its own turn and glow
    const flyers = [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-card.flyer')];
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
