import { afterEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Board } from './board';
import { RED, BLUE } from './pawn-highlight';
import { provideApi, GameStatePush, Pawn as ApiPawn } from '../../api';

// Port of PawnHighlightColors_IT (bucket C, Angular component test) — the
// *rendering wiring*. The colour maths itself (forPawn1/forPawn2 clash + fallback)
// is already covered exhaustively by pawn-highlight.spec.ts (22 cases). Here we
// verify a selected pawn's rendered highlight (the `--pawn-highlight` CSS var) and
// the 7-split step-box/label colours match the expected highlight.
//
// Player colours (from the game): 0=#A52A2A brown-red, 1=#0000A5 dark blue,
// 2=#008000 dark green. pawn1 prefers RED, pawn2 prefers GREEN; either falls back
// to BLUE on a hue clash.

const onBoard = (playerId: string, pawnNr: number, tileNr: number): ApiPawn => ({
  playerId,
  pawnId: { playerId, pawnNr },
  currentTileId: { playerId, tileNr },
  nestTileId: { playerId, tileNr: -(pawnNr + 1) },
});

const players = [
  { id: '0', name: 'P0', playerInt: 0, color: '#A52A2A' },
  { id: '1', name: 'P1', playerInt: 1, color: '#0000A5' },
  { id: '2', name: 'P2', playerInt: 2, color: '#008000' },
];

async function render(viewerId: string, state: GameStatePush): Promise<ComponentFixture<Board>> {
  document.cookie = `playerid=${viewerId}`;
  await TestBed.configureTestingModule({
    imports: [Board],
    providers: [provideHttpClient(), provideApi('')],
  }).compileComponents();
  const fixture = TestBed.createComponent(Board);
  (
    fixture.componentInstance as unknown as { handleGameState(v: GameStatePush): void }
  ).handleGameState(state);
  fixture.detectChanges();
  return fixture;
}

const base = (viewerId: string, pawns: ApiPawn[], cardValue?: number): GameStatePush => ({
  currentPlayerId: viewerId,
  players,
  pawns,
  winners: [],
  version: 1,
  playerCards: cardValue === undefined ? [] : [{ uuid: 1, suit: 0, value: cardValue }],
});

const pawnHighlight = (el: Element): string =>
  (el as HTMLElement).style.getPropertyValue('--pawn-highlight');

// jsdom keeps a CSS custom property (--pawn-highlight) as the raw hex, but
// normalises real colour properties (border-color / color) to rgb(). So step-box
// colours are compared against the rgb form of the highlight constants.
const toRgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('Pawn highlight rendering (PawnHighlightColors_IT)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('brownRedPawn_pawn1HighlightIsBlue', async () => {
    // Player 0 #A52A2A clashes with RED → pawn1 highlight falls back to BLUE.
    const fixture = await render('0', base('0', [onBoard('0', 0, 1)]));
    const pawn = fixture.nativeElement.querySelector('app-pawn.pawn') as HTMLElement;

    pawn.click();
    fixture.detectChanges();

    expect(pawnHighlight(pawn)).toBe(BLUE);
  });

  it('darkBluePawn_pawn1HighlightIsRed', async () => {
    // Player 1 #0000A5 does not clash with RED → pawn1 highlight stays RED.
    const fixture = await render('1', base('1', [onBoard('1', 0, 1)]));
    const pawn = fixture.nativeElement.querySelector('app-pawn.pawn') as HTMLElement;

    pawn.click();
    fixture.detectChanges();

    expect(pawnHighlight(pawn)).toBe(RED);
  });

  it('card7Split_darkGreenPawns_pawn1IsRed_pawn2IsBlue_stepBoxesMatch', async () => {
    // Player 2 #008000: as pawn1 → RED (no clash with RED); as pawn2 → BLUE
    // (clashes with GREEN). Two pawns on the board + a 7 in hand shows the split.
    const fixture = await render('2', base('2', [onBoard('2', 0, 1), onBoard('2', 1, 2)], 7));
    const el = fixture.nativeElement as HTMLElement;
    const [pawnA, pawnB] = el.querySelectorAll('app-pawn.pawn');

    (el.querySelector('app-card.card:not(.flyer)') as HTMLElement).click(); // select the 7
    fixture.detectChanges();
    (pawnA as HTMLElement).click(); // pawn1
    (pawnB as HTMLElement).click(); // pawn2
    fixture.detectChanges();

    expect(pawnHighlight(pawnA)).toBe(RED);
    expect(pawnHighlight(pawnB)).toBe(BLUE);

    // The 7-split step inputs/labels are coloured with the same highlight.
    const inputs = el.querySelectorAll('.pawn-steps__input');
    const labels = el.querySelectorAll('.pawn-steps__label');
    expect(inputs.length).toBe(2);
    expect((inputs[0] as HTMLElement).style.getPropertyValue('border-color')).toBe(toRgb(RED));
    expect((inputs[1] as HTMLElement).style.getPropertyValue('border-color')).toBe(toRgb(BLUE));
    expect((labels[0] as HTMLElement).style.color).toBe(toRgb(RED));
    expect((labels[1] as HTMLElement).style.color).toBe(toRgb(BLUE));
  });
});
