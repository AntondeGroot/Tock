import { describe, expect, it } from 'vitest';
import { PawnId } from '../../../api';
import { pawnKey } from './pawn-key';

// Port of the GWT client's PawnAnimationKeyTest (JUnit -> Vitest).
// GWT verified PawnClient.getPawnId() produces the plain-string map key used for
// animation element lookup. Two differences from the Java, both intentional:
//   - separator is ":" in Angular (GWT used "_"), so keys read "2:0" not "2_0";
//   - a missing JS Map lookup yields `undefined` (toBeUndefined), where Java's
//     HashMap.get returned null (assertNull).

const pawn = (playerId: string, pawnNr: number): PawnId => ({ playerId, pawnNr });

describe('PawnAnimationKey - pawnKey', () => {
  it('pawnId_hasCorrectFormat', () => {
    expect(pawnKey(pawn('2', 0))).toBe('2:0');
  });

  it('pawnId_usesPlayerIdAndPawnNr', () => {
    expect(pawnKey(pawn('3', 2))).toBe('3:2');
  });

  it('pawnElementLookup_succeedsWithStringKey', () => {
    // Mirrors how the animation map is populated by the UI (keyed "playerId:pawnNr")
    const pawnElements = new Map<string, string>([
      ['1:0', 'element-for-player1-pawn0'],
      ['2:1', 'element-for-player2-pawn1'],
    ]);

    // The exact lookup board.ts does — must not miss, or no animation runs
    const element = pawnElements.get(pawnKey(pawn('1', 0)));

    expect(element).toBe('element-for-player1-pawn0');
  });

  it('pawnElementLookup_returnsNull_whenPawnNotInMap', () => {
    const pawnElements = new Map<string, string>([['1:0', 'element-for-player1-pawn0']]);

    expect(pawnElements.get(pawnKey(pawn('4', 3)))).toBeUndefined();
  });
});
