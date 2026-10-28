import { describe, expect, it } from 'vitest';
import { buildBoard, GeomPlayer } from '../geometry/board-geometry';
import { turnEdge } from './turn-edge';

const createPlayers = (nr: number): GeomPlayer[] =>
  Array.from({ length: nr }, (_, i) => ({ id: String(i), playerInt: i }));

describe('turnEdge', () => {
  it('runs the streak exactly along a diagonal seat’s deck line, end to end', () => {
    const board = buildBoard(createPlayers(8), '0');
    const [start, end] = board.deckSegment('1')!;

    const edge = turnEdge(board, '1')!;

    // The streak is drawn from -halfLength to +halfLength along the edge's own x axis; mapped
    // back onto the board, those two points must be the deck line's ends.
    const radians = (edge.angle * Math.PI) / 180;
    const alongEdge = (t: number) => ({
      x: edge.cx + t * Math.cos(radians),
      y: edge.cy + t * Math.sin(radians),
    });
    expect(alongEdge(-edge.halfLength).x).toBeCloseTo(start.x);
    expect(alongEdge(-edge.halfLength).y).toBeCloseTo(start.y);
    expect(alongEdge(edge.halfLength).x).toBeCloseTo(end.x);
    expect(alongEdge(edge.halfLength).y).toBeCloseTo(end.y);
  });
});
