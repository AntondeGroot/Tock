import { describe, expect, it } from 'vitest';
import { Player } from '../../../api';
import { seatColor } from '../../../player-colors';
import {
  BLUE,
  GREEN,
  RED,
  clashes as colorsClash,
  computeHue,
  highlightForPawn1 as forPawn1,
  highlightForPawn2 as forPawn2,
  stepBoxColor,
} from './pawn-highlight';

// Port of the GWT client's PawnHighlightColorsTest (JUnit -> Vitest).
// GWT names are kept via import aliases so the cases read 1:1 with the Java:
//   colorsClash <- clashes, forPawn1/2 <- highlightForPawn1/2.
// GWT's `assertEquals(expected, actual, delta)` becomes toBeCloseTo(expected, 0),
// which passes when |expected - actual| < 0.5 (the pure-colour hues are exact).

// ── computeHue ──────────────────────────────────────────────────────────────
describe('PawnHighlightColors - computeHue', () => {
  it('computeHue_pureRed_returns0', () => {
    expect(computeHue([255, 0, 0])).toBeCloseTo(0, 0);
  });

  it('computeHue_pureGreen_returns120', () => {
    expect(computeHue([0, 255, 0])).toBeCloseTo(120, 0);
  });

  it('computeHue_pureBlue_returns240', () => {
    expect(computeHue([0, 0, 255])).toBeCloseTo(240, 0);
  });

  it('computeHue_achromatic_returns0', () => {
    // r == g == b -> delta == 0, exact
    expect(computeHue([128, 128, 128])).toBe(0);
  });
});

// ── colorsClash ───────────────────────────────────────────────────────────────
describe('PawnHighlightColors - colorsClash', () => {
  it('colorsClash_nullPawnColor_returnsFalse', () => {
    // GWT passes null; TS uses undefined (clashes() guards `if (!pawnColor)`)
    expect(colorsClash(undefined, RED)).toBe(false);
  });

  it('colorsClash_sameHue_returnsTrue', () => {
    expect(colorsClash('#ff0000', '#00ff00')).toBe(false); // red vs green: ~120 apart
    expect(colorsClash('#ff0000', '#ff2200')).toBe(true); // red vs orange-red: ~5 apart
  });

  it('colorsClash_redPawnVsRedHighlight_clashes', () => {
    // Pure red pawn vs RED highlight (#ef5350 ~ hue 1) -> same hue, clashes
    expect(colorsClash('#ff0000', RED)).toBe(true);
  });

  it('colorsClash_greenPawnVsGreenHighlight_clashes', () => {
    // Pure green pawn vs GREEN highlight (#66bb6a ~ hue 123) -> same hue, clashes
    expect(colorsClash('#00ff00', GREEN)).toBe(true);
  });

  it('colorsClash_bluePawnVsRedHighlight_doesNotClash', () => {
    // Pure blue (240) vs RED (~1) -> diff ~121 > 40, no clash
    expect(colorsClash('#0000ff', RED)).toBe(false);
  });

  it('colorsClash_orangeRedPawnVsRedHighlight_clashes', () => {
    // #ffaa00 ~ hue 40; diff from RED (~1) is ~39 < 40 -> clashes
    expect(colorsClash('#ffaa00', RED)).toBe(true);
  });

  it('colorsClash_yellowPawnVsRedHighlight_doesNotClash', () => {
    // Pure yellow #ffff00, hue 60; diff from RED (~1) is ~59 > 40 -> no clash
    expect(colorsClash('#ffff00', RED)).toBe(false);
  });

  it('colorsClash_wrapAroundHue_detected', () => {
    // #cc0044 ~ hue 340, only 20 from 0 via wrap-around -> clashes with RED
    expect(colorsClash('#cc0044', RED)).toBe(true);
  });
});

// ── forPawn1 ──────────────────────────────────────────────────────────────────
describe('PawnHighlightColors - forPawn1', () => {
  it('forPawn1_redPawn_returnsBlue', () => {
    // Red pawn clashes with RED highlight -> fallback to BLUE
    expect(forPawn1('#ff0000')).toBe(BLUE);
  });

  it('forPawn1_bluePawn_returnsRed', () => {
    expect(forPawn1('#0000ff')).toBe(RED);
  });

  it('forPawn1_greenPawn_returnsRed', () => {
    // Green pawn does not clash with RED (hue diff ~119) -> prefers RED
    expect(forPawn1('#00ff00')).toBe(RED);
  });

  it('forPawn1_brownPlayerColor_returnsRed', () => {
    // #A52A2A (player 0, brown-red) ~ hue 0, clashes with RED -> BLUE
    expect(forPawn1('#A52A2A')).toBe(BLUE);
  });

  it('forPawn1_darkBluePlayerColor_returnsRed', () => {
    // #0000A5 (player 1, dark blue) ~ hue 240, no clash with RED -> RED
    expect(forPawn1('#0000A5')).toBe(RED);
  });
});

// ── forPawn2 ──────────────────────────────────────────────────────────────────
describe('PawnHighlightColors - forPawn2', () => {
  it('forPawn2_greenPawn_returnsBlue', () => {
    // Green pawn clashes with GREEN highlight -> fallback to BLUE
    expect(forPawn2('#00ff00')).toBe(BLUE);
  });

  it('forPawn2_redPawn_returnsGreen', () => {
    // Red pawn does not clash with GREEN (hue diff ~119) -> prefers GREEN
    expect(forPawn2('#ff0000')).toBe(GREEN);
  });

  it('forPawn2_bluePawn_returnsGreen', () => {
    // Blue pawn does not clash with GREEN (hue diff ~117) -> prefers GREEN
    expect(forPawn2('#0000ff')).toBe(GREEN);
  });

  it('forPawn2_darkGreenPlayerColor_returnsBlue', () => {
    // #008000 (player 2, dark green) ~ hue 120, clashes with GREEN -> BLUE
    expect(forPawn2('#008000')).toBe(BLUE);
  });

  it('forPawn2_darkBluePlayerColor_returnsGreen', () => {
    // #0000A5 (player 1, dark blue) ~ hue 240, no clash with GREEN -> GREEN
    expect(forPawn2('#0000A5')).toBe(GREEN);
  });
});

describe('stepBoxColor', () => {
  const players: Player[] = [{ id: '0', name: 'P0', playerInt: 0 }];

  it('is undefined when no pawn is selected', () => {
    expect(stepBoxColor(undefined, players, 1)).toBeUndefined();
  });

  it('matches the pawn’s pawn-1 / pawn-2 highlight for its seat colour', () => {
    const seat = seatColor(0); // the pawn's own colour
    expect(stepBoxColor('0:2', players, 1)).toBe(forPawn1(seat));
    expect(stepBoxColor('0:2', players, 2)).toBe(forPawn2(seat));
  });

  it('falls back to the no-colour highlight for an unknown player', () => {
    expect(stepBoxColor('x:1', players, 1)).toBe(forPawn1(seatColor(undefined)));
  });
});
