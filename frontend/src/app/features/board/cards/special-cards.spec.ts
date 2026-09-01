import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Board } from '../board';
import { Translations } from '../../../i18n/translations.service';
import { provideApi, GameStatePush, Card as CardModel } from '../../../api';

// Special-card highlight + hint/suggestion (ported from the GWT GameBoardView).
// Special cards are Ace(1)/Four(4)/Seven(7)/Jack(11)/Queen(12)/King(13): they get
// the `special` class in the hand, and hovering/selecting one shows its hint.

const card = (uuid: number, value: number): CardModel => ({ uuid, suit: 0, value });

// Hand: Ace (special), a plain 5, and a Jack (special). Sorted by uuid == this order.
const stateWithHand = (): GameStatePush => ({
  currentPlayerId: '0',
  players: [
    { id: '0', name: 'P0', playerInt: 0, color: '#A52A2A' },
    { id: '1', name: 'P1', playerInt: 1, color: '#0000A5' },
  ],
  pawns: [],
  winners: [],
  version: 1,
  playerCards: [card(1, 1), card(2, 5), card(3, 11)],
});

describe('Special cards: highlight + hint', () => {
  let fixture: ComponentFixture<Board>;
  let i18n: Translations;

  const cards = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('app-card.card:not(.flyer)'));
  const hintText = (): string =>
    fixture.nativeElement.querySelector('.card-hint').textContent.trim();
  const fire = (el: HTMLElement, type: string): void => {
    el.dispatchEvent(new MouseEvent(type));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    document.cookie = 'playerid=0';
    document.cookie = 'language=en';

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [provideHttpClient(), provideApi('')],
    }).compileComponents();

    fixture = TestBed.createComponent(Board);
    i18n = TestBed.inject(Translations);
    (
      fixture.componentInstance as unknown as { handleGameState(v: GameStatePush): void }
    ).handleGameState(stateWithHand());
    fixture.detectChanges();
  });

  it('highlights special cards (Ace, Jack) but not a regular card', () => {
    const [ace, regular, jack] = cards();
    expect(ace.classList.contains('special')).toBe(true);
    expect(jack.classList.contains('special')).toBe(true);
    expect(regular.classList.contains('special')).toBe(false);
  });

  it('shows no hint by default and empty for a regular card', () => {
    expect(hintText()).toBe('');
    fire(cards()[1], 'mouseenter'); // the plain 5
    expect(hintText()).toBe('');
  });

  it('shows the hovered special card hint, and clears on mouse-out', () => {
    fire(cards()[0], 'mouseenter'); // Ace
    expect(hintText()).toBe(i18n.t('hintAce'));

    fire(cards()[0], 'mouseleave');
    expect(hintText()).toBe(''); // nothing selected → reverts to empty
  });

  it('falls back to the selected card hint when nothing is hovered', () => {
    cards()[2].click(); // select the Jack
    fixture.detectChanges();
    expect(hintText()).toBe(i18n.t('hintJack'));

    // Hovering the Ace overrides; leaving reverts to the selected Jack.
    fire(cards()[0], 'mouseenter');
    expect(hintText()).toBe(i18n.t('hintAce'));
    fire(cards()[0], 'mouseleave');
    expect(hintText()).toBe(i18n.t('hintJack'));
  });
});
