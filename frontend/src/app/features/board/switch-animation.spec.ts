import { afterEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Board } from './board';
import { provideApi, GameStatePush, MoveResponse, Pawn as ApiPawn } from '../../api';

// A Jack switch must WALK both pawns to each other's tile, not teleport them. The board sets the
// animation up from the push's lastMoveResponse *before* applying the new state, so right after
// the push each pawn still renders on its OLD tile and only then travels. If the animation never
// starts, both pawns render on their new tiles immediately — the "instant swap" bug.

const onBoard = (playerId: string, pawnNr: number, tileOwner: string, tileNr: number): ApiPawn => ({
  playerId,
  pawnId: { playerId, pawnNr },
  currentTileId: { playerId: tileOwner, tileNr },
  nestTileId: { playerId, tileNr: -(pawnNr + 1) },
});

// Four players in two teams: "0" (the viewer) partners "2"; "1" and "3" are the opponents.
const players = [
  { id: '0', name: 'P0', playerInt: 0, teamId: 0 },
  { id: '1', name: 'P1', playerInt: 1, teamId: 1 },
  { id: '2', name: 'P2', playerInt: 2, teamId: 0 },
  { id: '3', name: 'P3', playerInt: 3, teamId: 1 },
];

const TEAM_MATE_TILE = { playerId: '1', tileNr: 4 };
const OPPONENT_TILE = { playerId: '1', tileNr: 9 };

const push = (pawns: ApiPawn[], lastMoveResponse?: MoveResponse): GameStatePush => ({
  currentPlayerId: '0',
  players,
  pawns,
  winners: [],
  version: 1,
  playerCards: [],
  lastMoveResponse,
});

/** The viewer's own four pawns are home — that is what unlocks the teammate's pawns. */
const viewerPawnsHome = (): ApiPawn[] => [0, 1, 2, 3].map((nr) => onBoard('0', nr, '0', 16 + nr));

const position = (fixture: ComponentFixture<Board>, id: string): string => {
  const el = fixture.nativeElement.querySelector(`[data-testid="pawn-${id}"]`) as HTMLElement;
  return `${el.style.left},${el.style.top}`;
};

/** Feed a push through the component's real push handler (not just state.set). */
const receive = (fixture: ComponentFixture<Board>, state: GameStatePush): void => {
  (
    fixture.componentInstance as unknown as { handleGameState(v: GameStatePush): void }
  ).handleGameState(state);
  fixture.detectChanges();
};

describe('Jack switch animation', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('walks a teammate pawn and an opponent pawn instead of swapping them instantly', async () => {
    document.cookie = 'playerid=0';
    await TestBed.configureTestingModule({
      imports: [Board],
      providers: [provideHttpClient(), provideApi('')],
    }).compileComponents();
    const fixture = TestBed.createComponent(Board);
    fixture.detectChanges();

    const before = [
      ...viewerPawnsHome(),
      onBoard('2', 0, '1', 4), // the teammate's pawn
      onBoard('1', 0, '1', 9), // the opponent's pawn
    ];
    receive(fixture, push(before));
    const teamMateStart = position(fixture, '2:0');
    const opponentStart = position(fixture, '1:0');

    // The switch lands: the server reports both pawns on each other's tile, with the paths.
    const after = [...viewerPawnsHome(), onBoard('2', 0, '1', 9), onBoard('1', 0, '1', 4)];
    receive(
      fixture,
      push(after, {
        result: 'CAN_MAKE_MOVE',
        moveType: 'switch',
        pawn1: after[4],
        pawn2: after[5],
        movePawn1: [TEAM_MATE_TILE, OPPONENT_TILE],
        movePawn2: [OPPONENT_TILE, TEAM_MATE_TILE],
      }),
    );

    // Held at their old tiles for the walk — not teleported to the server's final tiles.
    expect(position(fixture, '2:0')).toBe(teamMateStart);
    expect(position(fixture, '1:0')).toBe(opponentStart);
  });
});
