import { BoardGeometry } from '../geometry/board-geometry';

/**
 * The straight edge of the player on turn, as the frame the turn streak is drawn in: the edge's
 * middle, its direction and half its length. Drawing in that frame keeps the streak's stretch and
 * glow running ALONG the edge on a diagonal seat too, instead of skewing in screen x/y.
 */
export interface TurnEdge {
  playerId: string;
  cx: number;
  cy: number;
  /** Direction of the edge, in degrees (SVG rotate). */
  angle: number;
  halfLength: number;
}

/** The edge the turn streak lies on: the player's card-deck line, where their hand fans out. */
export function turnEdge(g: BoardGeometry, playerId: string): TurnEdge | undefined {
  const segment = g.deckSegment(playerId);
  if (!segment) return undefined;
  const [start, end] = segment;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    playerId,
    cx: (start.x + end.x) / 2,
    cy: (start.y + end.y) / 2,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    halfLength: Math.hypot(dx, dy) / 2,
  };
}
