import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PawnTrail } from './pawn-trail';
import { PawnTrails } from './pawn-trails';

const trail: PawnTrail = {
  color: '#123456',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  startMs: 0,
  durationMs: 1000,
  litTiles: [],
  ripple: true,
};

/** A trail layer on a device where the player has, or has not, asked for less motion. */
function layerWithReducedMotion(reduce: boolean): PawnTrails {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduce } as MediaQueryList);
  const fixture = TestBed.createComponent(PawnTrails);
  fixture.componentRef.setInput('cell', 30);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('PawnTrails', () => {
  afterEach(() => vi.restoreAllMocks());

  // A trail is pure motion on top of a pawn that already walks, so a player who asked for less
  // motion loses nothing by not seeing it. No frames may run for them at all. The other half of
  // the test shows that frames do run otherwise, so the first half cannot pass by accident. The
  // spy starts after each layer exists, because Angular asks for frames of its own while creating.
  it('starts no drawing for a player who asked for reduced motion', () => {
    const framesRequestedBy = (layer: PawnTrails) => {
      const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
      layer.add([trail]);
      const requested = frame.mock.calls.length;
      frame.mockRestore();
      return requested;
    };

    // WHEN a trail arrives for a player who asked for reduced motion, THEN no frame is requested
    expect(framesRequestedBy(layerWithReducedMotion(true))).toBe(0);

    // WHEN the same trail arrives for anyone else, THEN drawing starts
    expect(framesRequestedBy(layerWithReducedMotion(false))).toBe(1);
  });
});
