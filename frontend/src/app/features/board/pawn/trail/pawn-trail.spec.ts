import { describe, expect, it } from 'vitest';
import { MoveResponse, Pawn } from '../../../../api';
import { BoardGeometry, Tile } from '../../geometry/board-geometry';
import { PawnWalk } from '../pawn-animator';
import { moveTrails } from './pawn-trail';

/** Tiles every 10px along one straight row, so at 0.1px/ms the pawn takes 100ms per tile. */
const rowOfTiles = (count: number): Tile[] =>
  Array.from({ length: count }, (_, tileNr) => ({ playerId: '1', tileNr, x: tileNr * 10, y: 0 }));

const pawn = (pawnNr: number): Pawn => ({
  playerId: '1',
  pawnId: { playerId: '1', pawnNr },
  currentTileId: { playerId: '1', tileNr: 0 },
  nestTileId: { playerId: '1', tileNr: -pawnNr - 1 },
});

const walkOfPawn = (pawnNr: number, ...xs: number[]): PawnWalk => ({
  id: `1:${pawnNr}`,
  points: xs.map((x) => ({ x, y: 0 })),
});

describe('moveTrails', () => {
  // The server only sends a walk's corners, so the tiles between them have to be found again. A
  // pawn that overshoots the finish lane walks back over its own tiles: those light once, at the
  // moment it FIRST reaches them, or the trail would seem to light up out of order.
  it('lights each tile a pawn walks over once, at the moment it first reaches it', () => {
    // GIVEN a pawn that walks from tile 1 up to tile 4 and back to tile 3, on a row of 6 tiles
    const g = { tiles: rowOfTiles(6) } as unknown as BoardGeometry;
    const walk = walkOfPawn(0, 10, 40, 30);
    const move: MoveResponse = { pawn1: pawn(0), moveType: 'move' };

    // WHEN the move's trails are worked out, with the move starting at 1000ms
    const [trail] = moveTrails(g, move, [walk], () => '#123456', 1000);

    // THEN tiles 1 to 4 are lit once each, in walking order, and tiles 0 and 5 stay dark
    expect(trail.litTiles.map((t) => [t.x, t.reachedAtMs])).toEqual([
      [10, 1000],
      [20, 1100],
      [30, 1200],
      [40, 1300],
    ]);
  });

  // These pawns travel in a straight line across the board rather than along the track, so any
  // tile that happens to lie under the line has nothing to do with the move and must stay dark.
  it.each(['switch', 'onBoard'] as const)(
    'lights no tiles for a %s move, which does not walk the track',
    (moveType) => {
      // GIVEN a pawn whose straight line runs over tiles 1 to 4
      const g = { tiles: rowOfTiles(6) } as unknown as BoardGeometry;
      const move: MoveResponse = { pawn1: pawn(0), moveType };

      // WHEN the move's trails are worked out
      const [trail] = moveTrails(g, move, [walkOfPawn(0, 10, 40)], () => '#123456', 1000);

      // THEN it still gets a trail with a landing ripple, but no lit tiles
      expect(trail.litTiles).toEqual([]);
      expect(trail.ripple).toBe(true);
    },
  );

  // A captured pawn is flung home in a straight line and has not arrived anywhere worth marking.
  // It only sets off once its killer lands, so its streak must wait for that too.
  it('gives a captured pawn only a streak, starting when its killer lands', () => {
    // GIVEN a pawn walking tiles 1 to 4, capturing a pawn that flies off 300ms in, as it lands
    const g = { tiles: rowOfTiles(6) } as unknown as BoardGeometry;
    const move: MoveResponse = { pawn1: pawn(0), pawnKilledByPawn1: pawn(1), moveType: 'move' };
    const killer = walkOfPawn(0, 10, 40);
    const victim = { ...walkOfPawn(1, 40, 0), delayMs: 300 };

    // WHEN the move's trails are worked out, with the move starting at 1000ms
    const [killerTrail, victimTrail] = moveTrails(g, move, [killer, victim], () => '#123456', 1000);

    // THEN the victim sets off at 1300ms, with no lit tiles and no ripple
    expect(victimTrail.startMs).toBe(1300);
    expect(victimTrail.litTiles).toEqual([]);
    expect(victimTrail.ripple).toBe(false);

    // AND the killer keeps its full trail
    expect(killerTrail.litTiles).toHaveLength(4);
    expect(killerTrail.ripple).toBe(true);
  });

  // A capture puts two players' pawns in one move. The walk only knows its pawn by id, so the owner
  // has to be looked up: a trail in the wrong colour would blame the wrong player for the move.
  it('colours each trail by the player who owns that pawn', () => {
    // GIVEN player 1's pawn capturing a pawn of player 2
    const g = { tiles: rowOfTiles(6) } as unknown as BoardGeometry;
    const pawnOfPlayer2: Pawn = { ...pawn(0), playerId: '2', pawnId: { playerId: '2', pawnNr: 0 } };
    const move: MoveResponse = {
      pawn1: pawn(0),
      pawnKilledByPawn1: pawnOfPlayer2,
      moveType: 'move',
    };
    const killer = walkOfPawn(0, 10, 40);
    const victim: PawnWalk = {
      id: '2:0',
      points: [
        { x: 40, y: 0 },
        { x: 0, y: 0 },
      ],
      delayMs: 300,
    };

    // WHEN the move's trails are worked out
    const trails = moveTrails(g, move, [killer, victim], (id) => `colour-of-${id}`, 1000);

    // THEN each trail has its own owner's colour
    expect(trails.map((t) => t.color)).toEqual(['colour-of-1', 'colour-of-2']);
  });
});
