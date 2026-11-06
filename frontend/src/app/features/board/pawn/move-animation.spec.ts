import { describe, expect, it } from 'vitest';
import { MoveResponse, Pawn, PositionKey } from '../../../api';
import { BoardGeometry } from '../geometry/board-geometry';
import { moveAnimation } from './move-animation';

/** A board laid out as one straight line: 10px per tile, so at 0.1px/ms a tile takes 100ms. */
const lineBoard = {
  position: (_playerId: string, tileNr: number) => ({ x: tileNr * 10, y: 0 }),
} as unknown as BoardGeometry;

const pawn = (pawnNr: number): Pawn => ({
  playerId: '1',
  pawnId: { playerId: '1', pawnNr },
  currentTileId: { playerId: '1', tileNr: 0 },
  nestTileId: { playerId: '1', tileNr: -pawnNr - 1 },
});

const path = (...tileNrs: number[]): PositionKey[] =>
  tileNrs.map((tileNr) => ({ playerId: '1', tileNr }));

describe('moveAnimation', () => {
  // Tile 16 is the first finish tile, so this walks from the last stretch of the board into the
  // lane. Its landing time is what the pawn-home sound is scheduled by.
  it('reports when a pawn coming in off the board lands in its finish lane', () => {
    // GIVEN a pawn walking from board tile 14 to finish tile 17
    const move: MoveResponse = { pawn1: pawn(0), movePawn1: path(14, 15, 17) };

    // WHEN the move is turned into an animation
    const { finishLandingsMs } = moveAnimation(lineBoard, move);

    // THEN its landing is reported: 3 tiles at 100ms each
    expect(finishLandingsMs).toEqual([300]);
  });

  // Shuffling along the lane is not coming home: the pawn was home already, so it earns no sound.
  it('does not report a pawn moving from one finish tile to another', () => {
    // GIVEN a pawn walking from finish tile 16 to finish tile 18
    const move: MoveResponse = { pawn1: pawn(0), movePawn1: path(16, 18) };

    // WHEN the move is turned into an animation
    const { finishLandingsMs } = moveAnimation(lineBoard, move);

    // THEN no landing is reported
    expect(finishLandingsMs).toEqual([]);
  });

  // Too many steps send a pawn up the lane, off its end and back out: its path holds a finish tile,
  // but the pawn ends up on the board. Only where it lands counts, not what it touched on the way.
  it('does not report a pawn that bounces off the finish lane back onto the board', () => {
    // GIVEN a pawn walking from board tile 13 up to finish tile 19 and back to board tile 14
    const move: MoveResponse = { pawn1: pawn(0), movePawn1: path(13, 19, 15, 14) };

    // WHEN the move is turned into an animation
    const { finishLandingsMs } = moveAnimation(lineBoard, move);

    // THEN no landing is reported
    expect(finishLandingsMs).toEqual([]);
  });

  // The two legs of a 7-split walk different distances, so the time reported must be that of the
  // pawn that came home. It is pawn 2 here, so reading pawn 1's walk by mistake would show up.
  it('reports only the pawn that came home when a split moves another along the board', () => {
    // GIVEN a split: pawn 1 stays on the board, pawn 2 walks from tile 14 into the finish lane
    const move: MoveResponse = {
      pawn1: pawn(0),
      movePawn1: path(2, 7),
      pawn2: pawn(1),
      movePawn2: path(14, 16),
    };

    // WHEN the move is turned into an animation
    const { finishLandingsMs } = moveAnimation(lineBoard, move);

    // THEN only pawn 2's landing is reported: 2 tiles at 100ms each, not pawn 1's 500ms
    expect(finishLandingsMs).toEqual([200]);
  });
});
