import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PawnAnimator, walkDurationMs } from './pawn-animator';
import { Pt } from '../geometry/board-geometry';

const pt = (x: number, y: number): Pt => ({ x, y });

describe('PawnAnimator', () => {
  let anim: PawnAnimator;

  beforeEach(() => {
    anim = new PawnAnimator();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('ignores a degenerate path (fewer than two waypoints)', () => {
    anim.enqueue([{ id: 'p', points: [pt(0, 0)] }]);
    expect(anim.positions().size).toBe(0);
  });

  it('holds the pawn at its start immediately, then walks and settles (clears) at the end', () => {
    anim.enqueue([{ id: 'p', points: [pt(0, 0), pt(100, 0)] }]); // 100px at 0.1px/ms → 1000ms

    // Held at the start this frame so the server's final tile can't snap it there.
    expect(anim.positions().get('p')).toEqual({ x: 0, y: 0, ms: 0 });

    // After the release frames it moves to the waypoint with that step's duration.
    vi.advanceTimersByTime(50);
    expect(anim.positions().get('p')).toEqual({ x: 100, y: 0, ms: 1000 });

    // Once the step completes it settles onto the server tile (drops out of the map).
    vi.advanceTimersByTime(1000);
    expect(anim.positions().has('p')).toBe(false);
  });

  it('delays the start of the walk by delayMs (holding at the start meanwhile)', () => {
    anim.enqueue([{ id: 'p', points: [pt(0, 0), pt(100, 0)], delayMs: 500 }]);
    expect(anim.positions().get('p')).toEqual({ x: 0, y: 0, ms: 0 });

    vi.advanceTimersByTime(50); // before the delay elapses — still held at the start
    expect(anim.positions().get('p')).toEqual({ x: 0, y: 0, ms: 0 });

    vi.advanceTimersByTime(500); // delay elapsed → it starts moving
    expect(anim.positions().get('p')).toEqual({ x: 100, y: 0, ms: 1000 });
  });

  it('a move queued mid-animation waits its turn instead of cutting the running one short', () => {
    // A move lands while the board is still animating the previous one — a different pawn, so
    // nothing forces them apart except the queue.
    anim.enqueue([{ id: 'a', points: [pt(0, 0), pt(100, 0)] }]); // 1000ms
    anim.enqueue([{ id: 'b', points: [pt(0, 0), pt(100, 0)] }]);
    vi.advanceTimersByTime(50);

    // 'a' walks; 'b' is parked on its start tile so the server's final tile can't show through.
    expect(anim.positions().get('a')).toEqual({ x: 100, y: 0, ms: 1000 });
    expect(anim.positions().get('b')).toEqual({ x: 0, y: 0, ms: 0 });

    // Only once 'a' has arrived and settled does 'b' set off.
    vi.advanceTimersByTime(1000);
    expect(anim.positions().has('a')).toBe(false);
    expect(anim.positions().get('b')).toEqual({ x: 100, y: 0, ms: 1000 });
  });

  it('walks multi-segment paths and scales speed to the total distance', () => {
    // 300px total → 0.12px/ms tier → 2500ms; 500px → 0.16px/ms → ~3125ms.
    expect(walkDurationMs([pt(0, 0), pt(300, 0)])).toBe(2500);
    expect(walkDurationMs([pt(0, 0), pt(500, 0)])).toBe(3125);
  });
});
