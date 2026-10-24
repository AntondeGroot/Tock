import { afterEach, vi } from 'vitest';
import { chooseSeatColor, resetSeatColors, seatColor, teamAccent } from './player-colors';

describe('seatColor', () => {
  it('maps a seat index to its palette colour', () => {
    expect(seatColor(0)).toBe('#A52A2A');
    expect(seatColor(1)).toBe('#1a6fbd');
  });

  it('falls back to grey when the seat is missing or out of range', () => {
    expect(seatColor(null)).toBe('#8a8a8a');
    expect(seatColor(undefined)).toBe('#8a8a8a');
    expect(seatColor(99)).toBe('#8a8a8a');
  });
});

describe('teamAccent', () => {
  it('maps teamId 0..3 to the roster accents (orange, blue, green, pink)', () => {
    expect(teamAccent(0)).toBe('#f0932a');
    expect(teamAccent(1)).toBe('#4da3e8');
    expect(teamAccent(2)).toBe('#35be83');
    expect(teamAccent(3)).toBe('#ee7ab6');
  });

  it('returns undefined when the player has no team', () => {
    expect(teamAccent(null)).toBeUndefined();
    expect(teamAccent(undefined)).toBeUndefined();
  });

  it('returns undefined for an out-of-range team', () => {
    expect(teamAccent(4)).toBeUndefined();
  });
});

describe('chosen seat colours', () => {
  afterEach(() => {
    resetSeatColors();
    document.cookie = 'pawnColors=; path=/; max-age=0';
  });

  // A player who can't tell two colours apart picks another for one seat. That pick has to win over
  // the palette, outlast a page reload (the next game is a fresh page), and "Original colours" has
  // to bring the palette back.
  it('replaces the palette colour, survives a reload, and resets to the palette', async () => {
    chooseSeatColor(1, '#ff00aa');
    expect(seatColor(1)).toBe('#ff00aa');
    expect(seatColor(0)).toBe('#A52A2A'); // the other seats keep theirs

    vi.resetModules(); // the page reloads: the module starts over from the cookie
    const reloaded = await import('./player-colors');
    expect(reloaded.seatColor(1)).toBe('#ff00aa');

    reloaded.resetSeatColors();
    expect(reloaded.seatColor(1)).toBe('#1a6fbd');
  });

  // The cookie can come back damaged (an older format, a hand edit, a cut-off write). The board
  // must still get colours to draw with: anything that isn't a proper #rrggbb colour is ignored,
  // and a good pick next to a bad one is kept.
  it.each([
    ['not JSON at all', 'not-json'],
    ['not a colour', JSON.stringify({ 1: 'url(javascript:alert(1))' })],
    ['a short colour', JSON.stringify({ 1: '#f0a' })],
  ])('ignores a damaged cookie (%s) and keeps the palette', async (_damage, saved) => {
    document.cookie = `pawnColors=${encodeURIComponent(saved)}; path=/`;

    vi.resetModules();
    const reloaded = await import('./player-colors');

    expect(reloaded.seatColor(1)).toBe('#1a6fbd');
  });

  it('keeps the good picks of a cookie that also holds a bad one', async () => {
    document.cookie = `pawnColors=${encodeURIComponent(
      JSON.stringify({ 0: '#00ff00', 1: 'red; background: url(x)' }),
    )}; path=/`;

    vi.resetModules();
    const reloaded = await import('./player-colors');

    expect(reloaded.seatColor(0)).toBe('#00ff00');
    expect(reloaded.seatColor(1)).toBe('#1a6fbd');
  });
});
