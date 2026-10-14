import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CardLayer } from './card-layer';
import { CardVM } from './card-table.types';

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

  // Goes in 5c-2, together with the `backs` input, once opponents' fans are face-down zones.
  // Until then the opponents' hands are drawn as plain backs at the places the game gives them,
  // dealt in on their own stagger — this pins that, so nothing changes before it is replaced.
  it('draws the backs of the other players at the places the game gives them', () => {
    // GIVEN two backs of an opponent's fan, the second dealt in 350ms later
    const fixture = TestBed.createComponent(CardLayer);
    fixture.componentRef.setInput('backs', [
      { key: 'p1:0', x: 10, y: 20, rot: -8, z: undefined, dealDelay: 0 },
      { key: 'p1:1', x: 12, y: 21, rot: 8, z: undefined, dealDelay: 350 },
    ]);

    // WHEN the layer draws them
    fixture.detectChanges();

    // THEN each is a back at its own place, leaving on its own turn
    const backs = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.card-back')];
    expect(
      backs.map((b) => {
        const style = (b as HTMLElement).style;
        return [style.left, style.top, style.transitionDelay];
      }),
    ).toEqual([
      ['10%', '20%', '0ms'],
      ['12%', '21%', '350ms'],
    ]);
  });
});
