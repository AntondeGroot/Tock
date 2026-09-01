import { describe, expect, it } from 'vitest';
import { Pawn as ApiPawn, Player } from '../../api';
import { seatColor } from '../../player-colors';
import { buildBoard } from './geometry/board-geometry';
import { projectCardBacks, projectPawns, projectTiles } from './board-view';
import { pawnKey } from './pawn/pawn-key';

// A real geometry for a 3-player game (viewer = player 0), so the projections are exercised
// against the same board maths the app uses.
const PLAYERS: Player[] = [
  { id: '0', name: 'P0', playerInt: 0, teamId: 1 },
  { id: '1', name: 'P1', playerInt: 1, teamId: 2 },
  { id: '2', name: 'P2', playerInt: 2, teamId: 1 },
];
const geo = () => buildBoard([...PLAYERS.map((p) => ({ id: p.id, playerInt: p.playerInt! }))], '0');

const nestPawn = (playerId: string, pawnNr: number): ApiPawn => ({
  playerId,
  pawnId: { playerId, pawnNr },
  currentTileId: { playerId, tileNr: -(pawnNr + 1) }, // nest tiles -1..-4 always exist
  nestTileId: { playerId, tileNr: -(pawnNr + 1) },
});

describe('projectTiles', () => {
  it('colours home/finish tiles by seat and leaves the shared track neutral', () => {
    const tiles = projectTiles(geo(), PLAYERS);
    const track = tiles.find((t) => t.playerId === '0' && t.tileNr === 5)!;
    const nest = tiles.find((t) => t.playerId === '0' && t.tileNr === -1)!;
    const finish = tiles.find((t) => t.playerId === '0' && t.tileNr >= 16)!;

    expect(track.color).toBe('#f2f2f2');
    expect(nest.color).toBe(seatColor(0));
    expect(finish.color).toBe(seatColor(0));
  });

  // An empty seat of a widened two-player board is board to cross, not somewhere to live: it has
  // nobody to colour it, no pawns to nest and no finish to aim for. Only its track is drawn — its
  // start tile included, which here belongs to no one and every pawn simply passes over.
  it('draws an empty seat as plain track, with no nest, finish or seat colour', () => {
    const widened: Player[] = [
      { id: '0', name: 'P0', playerInt: 0 },
      { id: 'empty-seat-p1', name: '', playerInt: 1, placeholder: true },
      { id: '2', name: 'P2', playerInt: 2 },
      { id: 'empty-seat-p3', name: '', playerInt: 3, placeholder: true },
    ];
    const board = buildBoard(
      widened.map((p) => ({ id: p.id, playerInt: p.playerInt! })),
      '0',
    );
    const tiles = projectTiles(board, widened);
    const empty = tiles.filter((t) => t.playerId === 'empty-seat-p1');

    // the full 0..15 stretch of track is there to be travelled (geometry order is not tile order)
    expect(empty.map((t) => t.tileNr).sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
    // …and every one of it is plain, the start tile included
    expect(empty.every((t) => t.color === '#f2f2f2')).toBe(true);
    // …while a seated player next to it keeps their own coloured nest and finish
    expect(tiles.find((t) => t.playerId === '2' && t.tileNr === -1)!.color).toBe(seatColor(2));
  });
});

describe('projectPawns', () => {
  it('places a pawn on its server tile with its seat colour, team and zIndex', () => {
    const pawn = nestPawn('1', 0);
    const [vm] = projectPawns(geo(), [pawn], PLAYERS, new Map());
    expect(vm.id).toBe(pawnKey(pawn.pawnId));
    expect(vm.color).toBe(seatColor(1));
    expect(vm.teamId).toBe(2);
    expect(vm.zIndex).toBe(Math.round(vm.y));
    expect(vm.moveMs).toBe(0);
  });

  it('uses the animation override (position + duration) while a pawn is moving', () => {
    const pawn = nestPawn('0', 0);
    const anim = new Map([[pawnKey(pawn.pawnId), { x: 12, y: 34, ms: 300 }]]);
    const [vm] = projectPawns(geo(), [pawn], PLAYERS, anim);
    expect(vm.x).toBe(12);
    expect(vm.y).toBe(34);
    expect(vm.moveMs).toBe(300);
  });

  it('drops a pawn whose tile has no geometry', () => {
    const ghost: ApiPawn = {
      playerId: '0',
      pawnId: { playerId: '0', pawnNr: 0 },
      currentTileId: { playerId: 'nobody', tileNr: 999 },
      nestTileId: { playerId: '0', tileNr: -1 },
    };
    expect(projectPawns(geo(), [ghost], PLAYERS, new Map())).toHaveLength(0);
  });
});

describe('projectCardBacks', () => {
  const counts = { '0': 5, '1': 3, '2': 4 };

  it('fans a back per card for every opponent, never for the viewer', () => {
    const backs = projectCardBacks(geo(), counts, '0', false, false);
    expect(backs).toHaveLength(counts['1'] + counts['2']); // opponents only
    expect(backs.some((b) => b.key.startsWith('0:'))).toBe(false); // never the viewer
    // At rest: no deal stagger, no explicit stacking z.
    expect(backs.every((b) => b.dealDelay === 0 && b.z === undefined)).toBe(true);
  });

  it('stacks the backs at the deck with a stagger while dealing', () => {
    const backs = projectCardBacks(geo(), counts, '0', true, true);
    expect(backs.every((b) => b.x === 315 / 6 && b.y === 300 / 6 && b.rot === 0)).toBe(true);
    expect(backs.some((b) => b.dealDelay > 0)).toBe(true);
    expect(backs.every((b) => typeof b.z === 'number')).toBe(true);
  });
});
