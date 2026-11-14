import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PawnAnimator, walkDurationMs } from './pawn-animator';
import { Pt } from '../geometry/board-geometry';
import { pointAt } from './trail/trail-timeline';

const pt = (x: number, y: number): Pt => ({ x, y });

describe('PawnAnimator', () => {
  let anim: PawnAnimator;

  beforeEach(() => {
    anim = new PawnAnimator();
    vi.useFakeTimers();
  });

  const xOf = (id: string) => anim.positions().get(id)?.x;

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
    expect(anim.positions().get('p')).toEqual({ x: 0, y: 0 });

    // Halfway through the walk it is halfway along the path.
    vi.advanceTimersByTime(500);
    expect(xOf('p')).toBeCloseTo(50, -1);

    // Once the walk completes it settles onto the server tile (drops out of the map).
    vi.advanceTimersByTime(520);
    expect(anim.positions().has('p')).toBe(false);
  });

  it('delays the start of the walk by delayMs (holding at the start meanwhile)', () => {
    anim.enqueue([{ id: 'p', points: [pt(0, 0), pt(100, 0)], delayMs: 500 }]);
    expect(anim.positions().get('p')).toEqual({ x: 0, y: 0 });

    vi.advanceTimersByTime(450); // before the delay elapses — still held at the start
    expect(anim.positions().get('p')).toEqual({ x: 0, y: 0 });

    vi.advanceTimersByTime(550); // delay elapsed → halfway along
    expect(xOf('p')).toBeCloseTo(50, -1);
  });

  it('a move queued mid-animation waits its turn instead of cutting the running one short', () => {
    // A move lands while the board is still animating the previous one — a different pawn, so
    // nothing forces them apart except the queue.
    anim.enqueue([{ id: 'a', points: [pt(0, 0), pt(100, 0)] }]); // 1000ms
    anim.enqueue([{ id: 'b', points: [pt(0, 0), pt(100, 0)] }]);
    vi.advanceTimersByTime(500);

    // 'a' walks; 'b' is parked on its start tile so the server's final tile can't show through.
    expect(xOf('a')).toBeCloseTo(50, -1);
    expect(anim.positions().get('b')).toEqual({ x: 0, y: 0 });

    // Only once 'a' has arrived and settled does 'b' set off.
    vi.advanceTimersByTime(1000);
    expect(anim.positions().has('a')).toBe(false);
    expect(xOf('b')).toBeCloseTo(50, -1);
  });

  it('keeps a pawn flung home exactly at the head of its trail', () => {
    // A victim leaving after its killer arrives, on a bent path: both clocks must agree throughout.
    const points = [pt(0, 0), pt(300, 0), pt(300, 200)];
    const wait = anim.enqueue([{ id: 'victim', points, delayMs: 400 }]);
    const trail = {
      color: '',
      points,
      startMs: performance.now() + wait + 400,
      durationMs: walkDurationMs(points),
      litTiles: [],
      ripple: false,
    };

    // Both loops run on the same animation frame and read its timestamp, as the trail layer does.
    for (const step of [500, 1000, 1000]) {
      vi.advanceTimersByTime(step);
      let frameMs = 0;
      requestAnimationFrame((t) => (frameMs = t));
      vi.advanceTimersToNextFrame();
      expect(anim.positions().get('victim')).toEqual(pointAt(trail, frameMs));
    }
  });

  it('keeps a pawn that arrives early on its end tile until the whole move is done', () => {
    // The killer arrives after 1000ms; its victim then flies home for another 1000ms.
    anim.enqueue([
      { id: 'killer', points: [pt(0, 0), pt(100, 0)] },
      { id: 'victim', points: [pt(100, 0), pt(100, 100)], delayMs: 1000 },
    ]);

    // Halfway through the victim's flight, the killer stands on its end tile, not yet settled.
    vi.advanceTimersByTime(1500);
    expect(anim.positions().get('killer')).toEqual({ x: 100, y: 0 });

    // Both settle together once the victim lands.
    vi.advanceTimersByTime(520);
    expect(anim.positions().size).toBe(0);
  });

  it('counts down remainingMs across every queued move, then reports 0', () => {
    expect(anim.remainingMs()).toBe(0);

    anim.enqueue([{ id: 'a', points: [pt(0, 0), pt(100, 0)] }]); // 1000ms
    anim.enqueue([{ id: 'b', points: [pt(0, 0), pt(100, 0)] }]); // queued behind it: 1000ms more
    expect(anim.remainingMs()).toBe(2000);

    vi.advanceTimersByTime(1500);
    expect(anim.remainingMs()).toBe(500);

    vi.advanceTimersByTime(1000); // past the end: never negative
    expect(anim.remainingMs()).toBe(0);
  });

  it('walks multi-segment paths and scales speed to the total distance', () => {
    // 300px total → 0.12px/ms tier → 2500ms; 500px → 0.16px/ms → ~3125ms.
    expect(walkDurationMs([pt(0, 0), pt(300, 0)])).toBe(2500);
    expect(walkDurationMs([pt(0, 0), pt(500, 0)])).toBe(3125);
  });
});
