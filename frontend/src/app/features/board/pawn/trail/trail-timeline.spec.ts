import { describe, expect, it } from 'vitest';
import { PawnTrail } from './pawn-trail';
import { isTrailOver, litTilesAt, pointAt, rippleAt, streakStrokes } from './trail-timeline';

/** A walk of 200px with one corner, taking 2000ms from the 1000ms mark: it ends at 3000ms. */
const trailRoundACorner = (overrides: Partial<PawnTrail> = {}): PawnTrail => ({
  color: '#123456',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ],
  startMs: 1000,
  durationMs: 2000,
  litTiles: [],
  ripple: true,
  ...overrides,
});

describe('trail timeline', () => {
  // The streak hangs off this, and the pawn itself walks corner to corner at a steady speed. If it
  // cut the corner or changed pace, the streak would drift off the track and away from the pawn.
  it('follows the path round a corner at a steady speed, and waits at both ends', () => {
    const trail = trailRoundACorner();

    // THEN before it sets off, the pawn is still on its first tile
    expect(pointAt(trail, 500)).toEqual({ x: 0, y: 0 });

    // AND a quarter of the time in, it is halfway along the first stretch
    expect(pointAt(trail, 1500)).toEqual({ x: 50, y: 0 });

    // AND three quarters of the time in, it is halfway along the stretch after the corner
    expect(pointAt(trail, 2500)).toEqual({ x: 100, y: 50 });

    // AND once it has landed, it stays on its last tile
    expect(pointAt(trail, 9000)).toEqual({ x: 100, y: 100 });
  });

  // The tail reaches 820ms back in time. It may not stick out ahead of a pawn that has not left
  // yet, and after the landing it has to shrink into the pawn rather than stop dead on the board.
  it('has no streak before the pawn sets off, and lets it run out after landing', () => {
    const trail = trailRoundACorner();

    // THEN before it sets off there is nothing to draw
    expect(streakStrokes(trail, 900)).toEqual([]);

    // AND mid-walk the longest stroke runs from the pawn back to where it was 820ms ago
    const [longest] = streakStrokes(trail, 2000);
    expect(longest.points[0]).toEqual({ x: 100, y: 0 });
    expect(longest.points[longest.points.length - 1]).toEqual({ x: 18, y: 0 });

    // AND shortly after landing the streak is still catching up with the pawn
    expect(streakStrokes(trail, 3400).length).toBeGreaterThan(0);

    // AND once the 820ms have passed it has gone
    expect(streakStrokes(trail, 3821)).toEqual([]);
  });

  // The lit tiles are what lets you count the steps, so one may not show before the pawn gets
  // there. They go out from the start of the walk towards the landing, so the trail drains into
  // the pawn: each tile starts fading 55ms after the one before it, 500ms after the landing.
  it('lights a tile once the pawn reaches it, then fades the tiles out one after another', () => {
    const trail = trailRoundACorner({
      litTiles: [
        { x: 0, y: 0, reachedAtMs: 1000 },
        { x: 100, y: 0, reachedAtMs: 2000 },
        { x: 100, y: 100, reachedAtMs: 3000 },
      ],
    });
    const litXsAndYs = (nowMs: number) => litTilesAt(trail, nowMs).map((t) => [t.x, t.y]);

    // THEN mid-walk only the tile already reached is lit, fully
    expect(litTilesAt(trail, 1500)).toEqual([{ x: 0, y: 0, opacity: 1, scale: 1 }]);

    // AND the tile the pawn has only just reached pops slightly larger
    expect(litTilesAt(trail, 2000)[1].scale).toBeCloseTo(1.2);

    // AND while fading, tiles nearer the landing are still brighter
    const [first, second, third] = litTilesAt(trail, 3850).map((t) => t.opacity);
    expect(first).toBeCloseTo(0.5);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);

    // AND the first tile goes out first, while the later ones are still lit
    expect(litXsAndYs(4201)).toEqual([
      [100, 0],
      [100, 100],
    ]);

    // AND in the end they have all gone
    expect(litXsAndYs(4311)).toEqual([]);
  });

  // The ripple marks the landing, so it belongs to one short moment on the last tile: it may not
  // show while the pawn is still walking, and it spreads out as it fades so it reads as a ring.
  it('spreads a ring out from the landing tile as it fades, for a moment after landing', () => {
    const trail = trailRoundACorner();

    // THEN there is no ring while the pawn is still walking
    expect(rippleAt(trail, 2900)).toBeUndefined();

    // AND halfway through its moment it sits on the landing tile, half faded
    const early = rippleAt(trail, 3310)!;
    expect([early.x, early.y]).toEqual([100, 100]);
    expect(early.opacity).toBeCloseTo(0.5);

    // AND later on it is wider and fainter
    const late = rippleAt(trail, 3500)!;
    expect(late.radiusCells).toBeGreaterThan(early.radiusCells);
    expect(late.opacity).toBeLessThan(early.opacity);

    // AND after its 620ms it has gone
    expect(rippleAt(trail, 3620)).toBeUndefined();

    // AND a trail without a ripple, like a captured pawn's, never shows one
    expect(rippleAt(trailRoundACorner({ ripple: false }), 3310)).toBeUndefined();
  });

  // A finished trail is dropped and no longer drawn, so ending it too early would make the last
  // tiles vanish mid-fade. A long walk fades out for longest: each tile starts 55ms after the last.
  it('is not over until the last tile of even a long walk has faded out', () => {
    // GIVEN a walk that lit 20 tiles and landed at 3000ms
    const litTiles = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0, reachedAtMs: 1000 + i }));
    const trail = trailRoundACorner({ litTiles });

    // THEN it is not over while the pawn walks, though it has not landed yet
    expect(isTrailOver(trail, 500)).toBe(false);
    expect(isTrailOver(trail, 2000)).toBe(false);

    // AND just before the last tile goes out, that tile is lit and the trail still runs
    expect(litTilesAt(trail, 5244)).toHaveLength(1);
    expect(isTrailOver(trail, 5244)).toBe(false);

    // AND soon after that there is nothing left and it is over
    expect(litTilesAt(trail, 5301)).toEqual([]);
    expect(isTrailOver(trail, 5301)).toBe(true);
  });
});
