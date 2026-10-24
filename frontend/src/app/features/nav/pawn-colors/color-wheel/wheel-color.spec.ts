import { describe, expect, it } from 'vitest';
import { wheelColor } from './wheel-color';

describe('wheelColor', () => {
  // One tap surface has to offer every kind of colour a player might need to tell pawns apart:
  // light ones in the middle, the strongest halfway out, dark ones at the rim — with the hue going
  // round (red to the right, cyan opposite). Outside the circle there is nothing to pick.
  it('runs from near-white in the middle through the pure colour to dark at the rim', () => {
    expect(wheelColor(0, 0)).toBe('#fee7e7'); // the centre: barely tinted
    expect(wheelColor(0.55, 0)).toBe('#f20d0d'); // halfway, to the right: strong red
    expect(wheelColor(-0.55, 0)).toBe('#0df2f2'); // halfway, opposite: strong cyan
    expect(wheelColor(1, 0)).toBe('#570505'); // the rim: dark red

    expect(wheelColor(0.8, 0.8)).toBeNull(); // past the rim, in the square's corner
  });
});
