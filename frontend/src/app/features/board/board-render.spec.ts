import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Board } from './board';
import { Translations } from '../../i18n/translations.service';
import { provideApi, GameStatePush, Card as CardModel, Pawn as ApiPawn } from '../../api';

// Ports of the frontend-only parts of Board_IT and MobileLocale_IT (bucket C).
//
// Board_IT counts (tiles / pawns / cards) map directly to the rendered DOM.
// MobileLocale_IT's play-button i18n text maps to the Translations service.
//
// NOT ported here (need a real browser → bucket D / N/A, see TEST_MIGRATION_CHECKLIST.md):
//   - Board_IT.playingFieldIsCenteredVertically — layout geometry, jsdom has none.
//   - MobileLocale_IT.mobileRedirectsToMobileHtml — Angular is a responsive SPA with
//     no separate mobile.html; there is no redirect.
//   - the mobile viewport itself is irrelevant to the DOM-count / i18n assertions.

const card = (uuid: number, value: number): CardModel => ({ uuid, suit: 0, value });

// A pawn on one of its own nest tiles (-1..-4), which always exist, so it renders.
const nestPawn = (playerId: string, pawnNr: number): ApiPawn => ({
  playerId,
  pawnId: { playerId, pawnNr },
  currentTileId: { playerId, tileNr: -(pawnNr + 1) },
  nestTileId: { playerId, tileNr: -(pawnNr + 1) },
});

// A standard 3-player game: 12 pawns (4 each on the nest) and a 5-card hand.
const threePlayerState = (): GameStatePush => ({
  currentPlayerId: '0',
  players: [
    { id: '0', name: 'P0', playerInt: 0, color: '#A52A2A' },
    { id: '1', name: 'P1', playerInt: 1, color: '#0000A5' },
    { id: '2', name: 'P2', playerInt: 2, color: '#008000' },
  ],
  pawns: ['0', '1', '2'].flatMap((pid) => [0, 1, 2, 3].map((nr) => nestPawn(pid, nr))),
  winners: [],
  version: 1,
  playerCards: [card(1, 3), card(2, 5), card(3, 7), card(4, 9), card(5, 11)],
});

describe('Board rendering (Board_IT / MobileLocale_IT)', () => {
  let fixture: ComponentFixture<Board>;
  const q = (sel: string): number => fixture.nativeElement.querySelectorAll(sel).length;
  const playButtonText = (): string =>
    fixture.nativeElement.querySelector('.send-button').textContent.trim();

  beforeEach(async () => {
    document.cookie = 'playerid=0';
    document.cookie = 'language=en'; // isolate from a prior test's setLanguage

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [provideHttpClient(), provideApi('')],
    }).compileComponents();

    fixture = TestBed.createComponent(Board);
    (
      fixture.componentInstance as unknown as { handleGameState(v: GameStatePush): void }
    ).handleGameState(threePlayerState());
    fixture.detectChanges();
  });

  it('verifyNumberOfTilesFor3Players', () => {
    expect(q('.tile')).toBe(24 * 3);
  });

  it('verifyNumberOfPawnsFor3Players', () => {
    expect(q('app-pawn.pawn')).toBe(12);
  });

  it('verifyNumberOfCardsForPlayer1', () => {
    expect(q('app-card.card:not(.flyer)')).toBe(5);
  });

  it('playButtonIsVisibleWithEnglishText', () => {
    expect(playButtonText()).toBe('Play Card');
  });

  it('afterSwitchingToNlPlayButtonTextIsDutch', () => {
    TestBed.inject(Translations).setLanguage('nl');
    fixture.detectChanges();
    expect(playButtonText()).toBe('Kaart spelen');
  });
});
