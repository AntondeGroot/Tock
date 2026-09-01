import { describe, expect, it } from 'vitest';
import { buildBoard, GeomPlayer } from './board-geometry';

// Port of the GWT client's BoardTest (JUnit -> Vitest).
// GWT asserted Board.getTiles().size() == 24 * nrPlayers — 24 tiles per section
// (16 track + 4 finish + 4 nest). Angular's buildBoard(...).tiles is the
// equivalent. GWT mocked Cookie.getPlayerId() to supply the viewer; here we pass
// viewerPlayerId explicitly ("0"). The tile count is independent of the viewer
// rotation, so it stays 24 * nrPlayers.

const createPlayers = (nr: number): GeomPlayer[] =>
  Array.from({ length: nr }, (_, i) => ({ id: String(i), playerInt: i }));

describe('Board - createBoard', () => {
  it('createBoardForTwoPlayers', () => {
    const { tiles } = buildBoard(createPlayers(2), '0');
    expect(tiles.length).toBe(24 * 2);
  });

  it('createBoardForEightPlayers', () => {
    const { tiles } = buildBoard(createPlayers(8), '0');
    expect(tiles.length).toBe(24 * 8);
  });
});
