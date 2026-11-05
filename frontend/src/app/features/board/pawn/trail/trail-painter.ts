import { Pt } from '../../geometry/board-geometry';
import { PawnTrail } from './pawn-trail';
import { litTilesAt, rippleAt, streakStrokes } from './trail-timeline';

const TILE_GAP_PX = 3; // a tile is this much narrower than its cell (see tileDiameter)
const TILE_FILL_OPACITY = 0.42;
const TILE_RING_CELLS = 0.07;
const TILE_RING_MIN_PX = 1.2;

const STREAK_WIDTH_CELLS = 0.74;
const STREAK_OPACITY = 0.085;
const STREAK_CORE_WIDTH_CELLS = 0.2;
const STREAK_CORE_OPACITY = 0.055;
const STREAK_MIN_WIDTH_PX = 0.4;

const RIPPLE_WIDTH_CELLS = 0.13;
const RIPPLE_OPACITY = 0.85;

/** Draws a trail at this moment. Coordinates are board pixels; `cell` is the board's tile spacing. */
export function paintTrail(
  ctx: CanvasRenderingContext2D,
  trail: PawnTrail,
  nowMs: number,
  cell: number,
): void {
  paintLitTiles(ctx, trail, nowMs, cell);
  paintStreak(ctx, trail, nowMs, cell);
  paintRipple(ctx, trail, nowMs, cell);
  ctx.globalAlpha = 1;
}

function paintLitTiles(
  ctx: CanvasRenderingContext2D,
  trail: PawnTrail,
  nowMs: number,
  cell: number,
): void {
  const radius = (cell - TILE_GAP_PX) / 2;
  ctx.fillStyle = trail.color;
  ctx.strokeStyle = trail.color;
  ctx.lineWidth = Math.max(TILE_RING_MIN_PX, cell * TILE_RING_CELLS);
  for (const tile of litTilesAt(trail, nowMs)) {
    ctx.beginPath();
    ctx.arc(tile.x, tile.y, radius * tile.scale, 0, Math.PI * 2);
    ctx.globalAlpha = TILE_FILL_OPACITY * tile.opacity;
    ctx.fill();
    ctx.globalAlpha = tile.opacity;
    ctx.stroke();
  }
}

function paintStreak(
  ctx: CanvasRenderingContext2D,
  trail: PawnTrail,
  nowMs: number,
  cell: number,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of streakStrokes(trail, nowMs)) {
    tracePath(ctx, stroke.points);
    ctx.globalAlpha = STREAK_OPACITY;
    ctx.strokeStyle = trail.color;
    ctx.lineWidth = STREAK_MIN_WIDTH_PX + cell * STREAK_WIDTH_CELLS * stroke.strength;
    ctx.stroke();
    ctx.globalAlpha = STREAK_CORE_OPACITY;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = STREAK_MIN_WIDTH_PX + cell * STREAK_CORE_WIDTH_CELLS * stroke.strength;
    ctx.stroke();
  }
}

function tracePath(ctx: CanvasRenderingContext2D, points: Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
}

function paintRipple(
  ctx: CanvasRenderingContext2D,
  trail: PawnTrail,
  nowMs: number,
  cell: number,
): void {
  const ripple = rippleAt(trail, nowMs);
  if (!ripple) return;
  ctx.beginPath();
  ctx.arc(ripple.x, ripple.y, ripple.radiusCells * cell, 0, Math.PI * 2);
  ctx.globalAlpha = RIPPLE_OPACITY * ripple.opacity;
  ctx.strokeStyle = trail.color;
  ctx.lineWidth = cell * RIPPLE_WIDTH_CELLS * ripple.opacity;
  ctx.stroke();
}
