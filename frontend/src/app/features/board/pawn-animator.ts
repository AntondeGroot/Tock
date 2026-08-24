import { signal } from '@angular/core';
import { Pt } from './board-geometry';

/** A pawn's live animated position: pixel coordinates + the transition duration of the step
 *  currently underway (ms). Present in {@link PawnAnimator.positions} only while it is moving. */
export interface PawnPos {
  x: number;
  y: number;
  ms: number;
}

/** One pawn's leg of a move: the waypoints to walk, optionally held back by `delayMs`. */
export interface PawnWalk {
  id: string;
  points: Pt[];
  /** Wait this long after the group starts (a captured pawn waits for its killer to arrive). */
  delayMs?: number;
}

/** px/ms — faster over longer paths, so a lap doesn't crawl (ported from calculateSpeed). */
function moveSpeed(distance: number): number {
  if (distance > 400) return 0.16;
  if (distance > 200) return 0.12;
  return 0.1;
}

function pathLength(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/** How long walking these waypoints takes (ms) — the caller needs it to sequence follow-ons. */
export function walkDurationMs(points: Pt[]): number {
  if (points.length < 2) return 0;
  const total = pathLength(points);
  return Math.round(total / moveSpeed(total));
}

/** How long a whole group takes: its slowest leg, delay included. */
function groupDurationMs(walks: PawnWalk[]): number {
  return Math.max(...walks.map((w) => (w.delayMs ?? 0) + walkDurationMs(w.points)));
}

/**
 * A small, framework-light engine that walks pawns along pixel waypoints. It owns only the live
 * position overrides (a signal keyed by pawn id); the view reads {@link positions} to place a pawn
 * mid-move instead of at the server's already-final tile, and a moving pawn drops out of the map
 * when it settles. Geometry and sounds stay with the game — it just supplies the waypoints and
 * calls {@link enqueue} — so this is unit-testable like a plain state machine.
 *
 * Moves are queued: each group plays out in full before the next one starts, so a move that lands
 * while the board is still animating waits its turn instead of cutting the previous one short.
 */
export class PawnAnimator {
  readonly positions = signal<Map<string, PawnPos>>(new Map());

  /** When the queue runs dry (ms, same clock as Date.now) — the next group starts no sooner. */
  private busyUntil = 0;

  /** Walks queued but not yet settled, per pawn: a pawn only settles when its last one ends. */
  private readonly queued = new Map<string, number>();

  /**
   * Queue a group of walks that play *together* — a Jack switch moves both pawns at once, and a
   * captured pawn flies home off its killer's arrival (`delayMs`). Groups play in order and each
   * plays out in full. Every pawn in the group is held at its start straight away, so the server's
   * already-final tile never shows through while the group waits its turn.
   *
   * @return how long this group waits before it starts (ms) — sequence sounds off it.
   */
  /** How long until the queue runs dry (ms); 0 when nothing is moving. */
  remainingMs(): number {
    return Math.max(0, this.busyUntil - Date.now());
  }

  enqueue(walks: PawnWalk[]): number {
    const legs = walks.filter((w) => w.points.length >= 2);
    if (legs.length === 0) return 0;

    const now = Date.now();
    const wait = Math.max(0, this.busyUntil - now);
    this.busyUntil = now + wait + groupDurationMs(legs);

    for (const leg of legs) {
      this.queued.set(leg.id, (this.queued.get(leg.id) ?? 0) + 1);
      this.hold(leg);
    }
    this.after(wait, () => legs.forEach((leg) => this.startWalk(leg)));
    this.after(this.busyUntil - now, () => legs.forEach((leg) => this.settle(leg)));
    return wait;
  }

  /**
   * Park a pawn on its starting waypoint while the group waits. A pawn already carrying a position
   * is mid-walk (or parked by an earlier group) and is left alone — that earlier position is the
   * truthful one, and this group's start is exactly where that walk will leave it.
   */
  private hold(leg: PawnWalk): void {
    if (!this.positions().has(leg.id)) {
      this.set(leg.id, leg.points[0].x, leg.points[0].y, 0);
    }
  }

  private startWalk(leg: PawnWalk): void {
    const speed = moveSpeed(pathLength(leg.points));
    this.set(leg.id, leg.points[0].x, leg.points[0].y, 0); // hold at the start for this frame
    const go = () =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.step(leg.id, leg.points, 1, speed)),
      );
    this.after(leg.delayMs ?? 0, go);
  }

  private step(id: string, points: Pt[], i: number, speed: number): void {
    if (i >= points.length) return; // arrived — the group settles it
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const ms = Math.max(16, Math.round(d / speed));
    this.set(id, points[i].x, points[i].y, ms);
    setTimeout(() => this.step(id, points, i + 1, speed), ms);
  }

  /** Drop the pawn's override so it settles onto the server's tile — unless more walks await it. */
  private settle(leg: PawnWalk): void {
    const left = (this.queued.get(leg.id) ?? 1) - 1;
    if (left > 0) {
      this.queued.set(leg.id, left);
      return; // a later group walks this pawn on from here — keep it under animation
    }
    this.queued.delete(leg.id);
    this.clear(leg.id);
  }

  private after(delayMs: number, action: () => void): void {
    if (delayMs > 0) setTimeout(action, delayMs);
    else action();
  }

  private set(id: string, x: number, y: number, ms: number): void {
    this.positions.update((m) => new Map(m).set(id, { x, y, ms }));
  }

  private clear(id: string): void {
    this.positions.update((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  }
}
