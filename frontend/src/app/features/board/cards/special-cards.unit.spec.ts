import { describe, expect, it } from 'vitest';
import { hintKeyFor, isSpecialCard } from './special-cards';

// Pure unit tests for the special-card domain helpers (the DOM-level behaviour is covered by
// special-cards.spec.ts). Special values: Ace(1), Four(4), Seven(7), Jack(11), Queen(12), King(13).

describe('isSpecialCard', () => {
  it('is true only for the special values', () => {
    expect([1, 4, 7, 11, 12, 13].every(isSpecialCard)).toBe(true);
    expect([2, 3, 5, 6, 8, 9, 10].some(isSpecialCard)).toBe(false);
  });
});

describe('hintKeyFor', () => {
  it('maps each special value to its hint key', () => {
    expect(hintKeyFor(1)).toBe('hintAce');
    expect(hintKeyFor(4)).toBe('hintFour');
    expect(hintKeyFor(7)).toBe('hintSeven');
    expect(hintKeyFor(11)).toBe('hintJack');
    expect(hintKeyFor(12)).toBe('hintQueen');
    expect(hintKeyFor(13)).toBe('hintKing');
  });

  it('returns undefined for a plain card or no value', () => {
    expect(hintKeyFor(5)).toBeUndefined();
    expect(hintKeyFor(null)).toBeUndefined();
    expect(hintKeyFor(undefined)).toBeUndefined();
  });
});
