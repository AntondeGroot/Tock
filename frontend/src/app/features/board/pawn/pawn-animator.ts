import { computed, signal } from '@angular/core';
import { Pt } from '../geometry/board-geometry';

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

export function pathLength(points: Pt[]): number {
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

/** The point `progress` (0 = start, 1 = end) of the way along the waypoints, by distance. */
export function pointAlong(points: Pt[], progress: number): Pt {
  let remaining = Math.min(1, Math.max(0, progress)) * pathLength(points);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length && length > 0) {
      const share = remaining / length;
      return { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share };
    }
    remaining -= length;
  }
  return points[points.length - 1];
}

/** A walk placed on the clock (performance.now ms). */
interface TimedWalk {
  id: string;
  points: Pt[];
  startMs: number;
  durationMs: number;
  /** The pawn stays under animation until its whole group is done, not just its own walk. */
  groupEndMs: number;
}

function positionAt(walk: TimedWalk, nowMs: number): Pt {
  const progress = walk.durationMs > 0 ? (nowMs - walk.startMs) / walk.durationMs : 1;
  return pointAlong(walk.points, progress);
}

/**
 * A small, framework-light engine that walks pawns along pixel waypoints. It owns only the live
 * position overrides (a signal keyed by pawn id); the view reads {@link positions} to place a pawn
 * mid-move instead of at the server's already-final tile, and a moving pawn drops out of the map
 * when it settles. Geometry and sounds stay with the game — it just supplies the waypoints and
 * calls {@link enqueue} — so this is unit-testable like a plain state machine.
 *
 * Every frame places each moving pawn where the clock says it is, the same way the trails are
 * drawn, so a pawn glides at an even speed and its trail stays exactly behind it.
 *
 * Moves are queued: each group plays out in full before the next one starts, so a move that lands
 * while the board is still animating waits its turn instead of cutting the previous one short.
 */
export class PawnAnimator {
  readonly positions = signal<ReadonlyMap<string, Pt>>(new Map());

  /** Whether any pawn is moving or waiting its turn to — true from enqueue until all settle. */
  readonly moving = computed(() => this.positions().size > 0);

  /** When the queue runs dry (performance.now ms) — the next group starts no sooner. */
  private busyUntil = 0;

  /** In the order they play: a pawn follows the first of its walks whose group isn't done. */
  private walks: TimedWalk[] = [];

  private frameId: number | undefined;

  /** How long until the queue runs dry (ms); 0 when nothing is moving. */
  remainingMs(): number {
    return Math.max(0, this.busyUntil - performance.now());
  }

  /**
   * Queue a group of walks that play *together* — a Jack switch moves both pawns at once, and a
   * captured pawn flies home off its killer's arrival (`delayMs`). Groups play in order and each
   * plays out in full. Every pawn in the group is held at its start straight away, so the server's
   * already-final tile never shows through while the group waits its turn.
   *
   * @return how long this group waits before it starts (ms) — sequence sounds and trails off it.
   */
  enqueue(walks: PawnWalk[]): number {
    const legs = walks.filter((w) => w.points.length >= 2);
    if (legs.length === 0) return 0;

    const now = performance.now();
    const groupStartMs = Math.max(now, this.busyUntil);
    this.busyUntil = groupStartMs + groupDurationMs(legs);
    for (const leg of legs) {
      this.walks.push({
        id: leg.id,
        points: leg.points,
        startMs: groupStartMs + (leg.delayMs ?? 0),
        durationMs: walkDurationMs(leg.points),
        groupEndMs: this.busyUntil,
      });
    }
    this.place(now);
    this.frameId ??= requestAnimationFrame(this.onFrame);
    return groupStartMs - now;
  }

  private readonly onFrame = (frameMs: number): void => {
    this.place(frameMs);
    this.frameId = this.walks.length > 0 ? requestAnimationFrame(this.onFrame) : undefined;
  };

  /** Puts every pawn under animation where it is at this moment; a finished one settles. */
  private place(nowMs: number): void {
    this.walks = this.walks.filter((walk) => nowMs < walk.groupEndMs);
    const positions = new Map<string, Pt>();
    for (const walk of this.walks) {
      if (!positions.has(walk.id)) positions.set(walk.id, positionAt(walk, nowMs));
    }
    this.positions.set(positions);
  }
}
