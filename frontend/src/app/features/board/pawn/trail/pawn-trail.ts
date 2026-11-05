import { MoveResponse, Pawn } from '../../../../api';
import { BoardGeometry, Pt, Tile } from '../../geometry/board-geometry';
import { pathLength, PawnWalk, walkDurationMs } from '../pawn-animator';
import { pawnKey } from '../pawn-key';

/** A tile the pawn walks over, and the moment it gets there. */
export interface LitTile extends Pt {
  reachedAtMs: number;
}

/** Everything needed to draw the trail one pawn leaves behind during a move. */
export interface PawnTrail {
  color: string;
  points: Pt[];
  startMs: number;
  durationMs: number;
  /** In the order the pawn reaches them. */
  litTiles: LitTile[];
  /** Whether the landing is marked: a captured pawn flung home has not arrived anywhere. */
  ripple: boolean;
}

/** Tile centres are rounded to 0.1px, so this finds the tiles a path runs through and no others. */
const ON_PATH_TOLERANCE_PX = 1.5;

/** How far along the path it first passes over this tile, or undefined when it never does. */
function firstDistanceOnPath(tile: Pt, points: Pt[]): number | undefined {
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 0) {
      const along = ((tile.x - a.x) * (b.x - a.x) + (tile.y - a.y) * (b.y - a.y)) / length;
      const clamped = Math.min(length, Math.max(0, along));
      const closest = {
        x: a.x + ((b.x - a.x) * clamped) / length,
        y: a.y + ((b.y - a.y) * clamped) / length,
      };
      if (Math.hypot(tile.x - closest.x, tile.y - closest.y) <= ON_PATH_TOLERANCE_PX) {
        return walked + clamped;
      }
    }
    walked += length;
  }
  return undefined;
}

/** The board's tiles under this walk, each with the moment the pawn reaches it. */
function tilesAlong(tiles: Tile[], points: Pt[], startMs: number, durationMs: number): LitTile[] {
  const total = pathLength(points);
  return tiles
    .flatMap((tile) => {
      const distance = firstDistanceOnPath(tile, points);
      if (distance === undefined) return [];
      return [{ x: tile.x, y: tile.y, reachedAtMs: startMs + (distance / total) * durationMs }];
    })
    .sort((a, b) => a.reachedAtMs - b.reachedAtMs);
}

/**
 * The trails of a move's pawns. Only a pawn walking the track lights its tiles: a Jack switch and a
 * pawn leaving its nest travel in a straight line across the board, over tiles that have nothing
 * to do with the move, and so does a captured pawn flung home.
 *
 * @param groupStartMs when the animator starts this move, on the performance.now clock.
 */
export function moveTrails(
  g: BoardGeometry,
  mr: MoveResponse,
  walks: PawnWalk[],
  colorOf: (playerId: string) => string,
  groupStartMs: number,
): PawnTrail[] {
  const victims = [mr.pawnKilledByPawn1, mr.pawnKilledByPawn2];
  const isVictim = (walk: PawnWalk) => victims.some((p) => matches(p, walk));
  const walksTheTrack = mr.moveType !== 'switch' && mr.moveType !== 'onBoard';
  const pawns = [mr.pawn1, mr.pawn2, ...victims];

  return walks
    .filter((walk) => walk.points.length >= 2)
    .map((walk) => {
      const startMs = groupStartMs + (walk.delayMs ?? 0);
      const durationMs = walkDurationMs(walk.points);
      const lightsTiles = walksTheTrack && !isVictim(walk);
      return {
        color: colorOf(pawns.find((p) => matches(p, walk))?.playerId ?? ''),
        points: walk.points,
        startMs,
        durationMs,
        litTiles: lightsTiles ? tilesAlong(g.tiles, walk.points, startMs, durationMs) : [],
        ripple: !isVictim(walk),
      };
    });
}

function matches(pawn: Pawn | undefined, walk: PawnWalk): boolean {
  return !!pawn && pawnKey(pawn.pawnId) === walk.id;
}
