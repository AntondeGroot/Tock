import { Pt } from '../../geometry/board-geometry';
import { pathLength } from '../pawn-animator';
import { PawnTrail } from './pawn-trail';

// What a trail looks like at a given moment, as plain numbers: no canvas here, so the timing can be
// tested without drawing anything. The painter turns these into pixels.

const STREAK_TAIL_MS = 820;
/** The streak is many nested strokes that add up to a smooth taper, round at the corners. */
const STREAK_LAYERS = 16;
const STREAK_SAMPLE_MS = 14;

const TILE_HOLD_MS = 500;
/** The tiles go out one after another, towards the landing, rather than all at once. */
const TILE_STAGGER_MS = 55;
const TILE_FADE_MS = 700;
/** A tile pops slightly larger for this long as the pawn reaches it. */
const TILE_POP_MS = 170;
const TILE_POP_SCALE = 0.2;

const RIPPLE_MS = 620;
const RIPPLE_START_CELLS = 0.38;
const RIPPLE_GROWTH_CELLS = 0.72;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const endOf = (trail: PawnTrail) => trail.startMs + trail.durationMs;

/** Where the pawn is at this moment. */
export function pointAt(trail: PawnTrail, nowMs: number): Pt {
  const progress = trail.durationMs > 0 ? clamp01((nowMs - trail.startMs) / trail.durationMs) : 1;
  let remaining = progress * pathLength(trail.points);
  for (let i = 1; i < trail.points.length; i++) {
    const [a, b] = [trail.points[i - 1], trail.points[i]];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length && length > 0) {
      const share = remaining / length;
      return { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share };
    }
    remaining -= length;
  }
  return trail.points[trail.points.length - 1];
}

/** One stroke of the streak; `strength` runs from 0 (the far tip) towards 1 (at the pawn). */
export interface StreakStroke {
  points: Pt[];
  strength: number;
}

/** The nested strokes of the streak, longest and thinnest first. Empty once it has run out. */
export function streakStrokes(trail: PawnTrail, nowMs: number): StreakStroke[] {
  const head = Math.min(nowMs, endOf(trail));
  const strokes: StreakStroke[] = [];
  for (let layer = 0; layer < STREAK_LAYERS; layer++) {
    const reach = 1 - layer / STREAK_LAYERS;
    const tail = Math.max(trail.startMs, nowMs - STREAK_TAIL_MS * reach);
    if (tail < head) {
      strokes.push({ points: samplePath(trail, head, tail), strength: (1 - reach) ** 0.7 });
    }
  }
  return strokes;
}

function samplePath(trail: PawnTrail, fromMs: number, toMs: number): Pt[] {
  const points = [pointAt(trail, fromMs)];
  for (let ms = fromMs - STREAK_SAMPLE_MS; ms > toMs; ms -= STREAK_SAMPLE_MS) {
    points.push(pointAt(trail, ms));
  }
  points.push(pointAt(trail, toMs));
  return points;
}

/** A tile lit right now: how visible it is (0..1), and its size relative to the tile (1 = same). */
export interface LitTileState extends Pt {
  opacity: number;
  scale: number;
}

/** The tiles lit right now: reached already, and not yet faded out. */
export function litTilesAt(trail: PawnTrail, nowMs: number): LitTileState[] {
  return trail.litTiles.flatMap((tile, order) => {
    if (nowMs < tile.reachedAtMs) return [];
    const fadeStart = endOf(trail) + TILE_HOLD_MS + order * TILE_STAGGER_MS;
    const opacity = 1 - clamp01((nowMs - fadeStart) / TILE_FADE_MS);
    if (opacity <= 0) return [];
    const pop = 1 - clamp01((nowMs - tile.reachedAtMs) / TILE_POP_MS);
    return [{ x: tile.x, y: tile.y, opacity, scale: 1 + TILE_POP_SCALE * pop }];
  });
}

/** The landing ring right now: its radius in cells, and how visible it is (0..1). */
export interface RippleState extends Pt {
  radiusCells: number;
  opacity: number;
}

/** The ring spreading out from where the pawn landed, or undefined outside its moment. */
export function rippleAt(trail: PawnTrail, nowMs: number): RippleState | undefined {
  const age = (nowMs - endOf(trail)) / RIPPLE_MS;
  if (!trail.ripple || age <= 0 || age >= 1) return undefined;
  return {
    ...trail.points[trail.points.length - 1],
    radiusCells: RIPPLE_START_CELLS + RIPPLE_GROWTH_CELLS * age ** 0.7,
    opacity: 1 - age,
  };
}

/** Whether nothing of this trail is left to draw. */
export function isTrailOver(trail: PawnTrail, nowMs: number): boolean {
  const tilesFadedAfter = TILE_HOLD_MS + trail.litTiles.length * TILE_STAGGER_MS + TILE_FADE_MS;
  return nowMs > endOf(trail) + Math.max(STREAK_TAIL_MS, RIPPLE_MS, tilesFadedAfter);
}
