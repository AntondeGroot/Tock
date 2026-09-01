import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Board } from '../board';
import { provideApi, GameStatePush, Pawn as ApiPawn } from '../../../api';

// Port of AutoSelectCardBorder_IT (bucket C, Angular component test).
//
// Clicking a nest pawn when the only come-on-board card in hand is a King must
// auto-select that card (GWT showed this as the red selection border). We assert
// the state that drives the border — the `selected` class on the card — because
// jsdom doesn't compute stylesheet CSS (the exact 3px/red is a bucket-D check).
//
// The board's constructor effect feeds the selection the hand + pawn positions on
// every state change, so clicking the pawn auto-selects the King via the ported
// PawnAndCardSelection state machine.

const nestPawn0: ApiPawn = {
  playerId: '0',
  pawnId: { playerId: '0', pawnNr: 0 },
  currentTileId: { playerId: '0', tileNr: -1 }, // on the nest
  nestTileId: { playerId: '0', tileNr: -1 },
};

// Viewer (player 0) holds only a King (value 13) and has one pawn on the nest.
const stateOnlyKing = (): GameStatePush => ({
  currentPlayerId: '0',
  players: [
    { id: '0', name: 'P0', playerInt: 0, color: '#A52A2A' },
    { id: '1', name: 'P1', playerInt: 1, color: '#0000A5' },
  ],
  pawns: [nestPawn0],
  winners: [],
  version: 1,
  playerCards: [{ uuid: 1, suit: 0, value: 13 }],
});

describe('Auto-select card (AutoSelectCardBorder_IT)', () => {
  let fixture: ComponentFixture<Board>;

  const pawn = (): HTMLElement => fixture.nativeElement.querySelector('app-pawn.pawn');
  const kingSelected = (): boolean =>
    fixture.nativeElement.querySelector('app-card.card:not(.flyer)').classList.contains('selected');
  const clickPawn = (): void => {
    pawn().click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    document.cookie = 'playerid=0';

    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [provideHttpClient(), provideApi('')],
    }).compileComponents();

    fixture = TestBed.createComponent(Board);
    (
      fixture.componentInstance as unknown as { handleGameState(v: GameStatePush): void }
    ).handleGameState(stateOnlyKing());
    fixture.detectChanges();
  });

  it('clickNestPawn_withOnlyKing_cardGetsSelected', () => {
    clickPawn();

    expect(kingSelected()).toBe(true);
  });

  it('deselectingNestPawn_removesAutoSelectedCardSelection', () => {
    clickPawn(); // auto-selects the King
    clickPawn(); // deselect the pawn — the auto-selected card loses its justification

    expect(kingSelected()).toBe(false);
  });
});
