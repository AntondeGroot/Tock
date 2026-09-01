import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Board } from '../board';
import { provideApi, GameStatePush, Card as CardModel } from '../../../api';

// Port of the GWT client's Card_IT (bucket C — frontend-only, Angular component test).
//
// The GWT Selenium test clicked `.cardDiv` elements and asserted the *computed*
// border ("3px", "rgb(255,0,0)"). jsdom (the component-test DOM) does not apply
// styles from component stylesheets to getComputedStyle, so we can't read the
// pixel border here. Instead we assert the state that *drives* the border — the
// `selected` class on the card element (`[class.selected]="selectedCardUuid() ...`).
// The exact border px/colour is a real-browser concern, verified in the bucket-D
// Playwright suite. Card identity ("click same card again deselects", "click
// another card") is exercised the same way the GWT test did.
//
// The board reads its hand from the game state (`state().playerCards`) and only
// renders the card layer once it has geometry (@if (tiles().length)), which needs
// players + a viewer. So we set a `playerid` cookie (the viewer) — but NOT a
// `sessionid`, so ngOnInit opens no EventSource — and seed the state signal with a
// two-player game + a hand. Selecting a card issues no HTTP call (checkMove
// early-returns without a selected pawn).

const card = (uuid: number, value: number): CardModel => ({ uuid, suit: 0, value });

// Minimal valid game state: a 2-player board (so tiles render) with a three-card
// hand. uuids are ordered; the board sorts rendered cards by uuid, so DOM index
// == uuid order.
const stateWithHand = (): GameStatePush => ({
  currentPlayerId: '0',
  pawns: [],
  players: [
    { id: '0', name: 'P0', playerInt: 0, color: '#A52A2A' },
    { id: '1', name: 'P1', playerInt: 1, color: '#0000A5' },
  ],
  winners: [],
  version: 1,
  playerCards: [card(1, 5), card(2, 9), card(3, 13)],
});

describe('Card selection (Card_IT)', () => {
  let fixture: ComponentFixture<Board>;
  let cards: HTMLElement[];

  const handCards = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('app-card.card:not(.flyer)'));

  const isSelected = (i: number): boolean => cards[i].classList.contains('selected');

  const clickCard = (i: number): void => {
    cards[i].click();
    fixture.detectChanges();
    cards = handCards(); // re-fetch, mirroring the GWT re-fetch after DOM updates
  };

  beforeEach(async () => {
    // The viewer seat — resolveGameSession() reads this at construction. No
    // sessionid, so ngOnInit opens no EventSource.
    document.cookie = 'playerid=0';

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [provideHttpClient(), provideApi('')],
    }).compileComponents();

    fixture = TestBed.createComponent(Board);
    (
      fixture.componentInstance as unknown as { handleGameState(v: GameStatePush): void }
    ).handleGameState(stateWithHand());
    fixture.detectChanges();
    cards = handCards();
  });

  it('clickOnCard_BorderVisible', () => {
    expect(cards.length).toBe(3);

    clickCard(0);

    expect(isSelected(0)).toBe(true);
  });

  it('clickOnCardTwice_BorderHidden', () => {
    clickCard(0);
    clickCard(0);

    expect(isSelected(0)).toBe(false);
  });

  it('clickOnCard_ClickOtherCard_BorderFirstCardHidden', () => {
    clickCard(0);
    clickCard(1);

    expect(isSelected(0)).toBe(false);
    expect(isSelected(1)).toBe(true);
  });

  it('splitBoxes_DefaultNotShown', () => {
    // The 7-split step inputs (`.pawn-steps`, GWT's pawnIntegerBoxes) render only
    // behind @if (splitVisible()); with no card-7 + two-pawn selection they are absent.
    expect(fixture.nativeElement.querySelector('.pawn-steps')).toBeNull();
  });
});
