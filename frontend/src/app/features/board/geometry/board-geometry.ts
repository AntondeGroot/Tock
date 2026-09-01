/**
 * Board geometry — a faithful TypeScript port of the GWT board layout
 * (Board.java + CellDistance.java + Point.rotate).
 *
 * It computes the pixel centre of every tile so the board can be rendered
 * declaratively (absolutely-positioned elements + [style] bindings) instead of
 * drawn on a canvas. Coordinate space is BOARD_SIZE x BOARD_SIZE, origin
 * top-left; all rotations are about the board centre.
 *
 * Pure functions only — no Angular here, so it is trivially unit-testable.
 */

export const BOARD_SIZE = 600;
export const PAWN_SIZE = 50;

const CENTER: Pt = { x: BOARD_SIZE / 2, y: BOARD_SIZE / 2 }; // (300, 300)
const PADDING = 50;

export interface Pt {
  x: number;
  y: number;
}

/** A board cell: which player's section it belongs to, its tile number, and its centre pixel. */
export interface Tile {
  playerId: string;
  tileNr: number;
  x: number;
  y: number;
}

/** The minimal player shape the geometry needs (a subset of the API `Player`). */
export interface GeomPlayer {
  id: string;
  playerInt: number;
}

export interface BoardGeometry {
  tiles: Tile[];
  cellDistance: number;
  /** Centre pixel of a specific tile, or undefined if it does not exist. */
  position(playerId: string, tileNr: number): Pt | undefined;
  /** The [start, end] pixels of a player's card-deck line (where their hand fans). */
  deckSegment(playerId: string): [Pt, Pt] | undefined;
}

/** Matches Point.roundedValue: round to one decimal. */
const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Port of Point.rotate — rotate `p` around `center` by `angleDeg` degrees. */
function rotate(p: Pt, center: Pt, angleDeg: number): Pt {
  const a = (angleDeg * Math.PI) / 180;
  const tx = p.x - center.x;
  const ty = p.y - center.y;
  return {
    x: round1(tx * Math.cos(a) - ty * Math.sin(a) + center.x),
    y: round1(tx * Math.sin(a) + ty * Math.cos(a) + center.y),
  };
}

/** Port of CellDistance.getCellDistance — spacing between adjacent tiles. */
export function getCellDistance(nrPlayers: number, boardSize = BOARD_SIZE): number {
  const availableRadius = boardSize / 2 - PADDING;
  const y = 2 * Math.tan(((90 - 180 / nrPlayers) * Math.PI) / 180);
  return availableRadius / (6 + y);
}

/** Port of CellDistance.getStartPoint — where the base track section begins. */
function getStartPoint(nrPlayers: number, boardSize = BOARD_SIZE): Pt {
  const cell = getCellDistance(nrPlayers, boardSize);
  const y = 2 * Math.tan(((90 - 180 / nrPlayers) * Math.PI) / 180);
  return { x: round1(boardSize / 2 + 2 * cell), y: round1(boardSize / 2 + y * cell) };
}

/**
 * Build the full board for `players`, rotated so that `viewerPlayerId`'s section
 * sits at the bottom (same as the GWT client, which rotates around the cookie's
 * player). Port of Board.createBoard.
 */
export function buildBoard(
  players: GeomPlayer[],
  viewerPlayerId: string,
  boardSize = BOARD_SIZE,
): BoardGeometry {
  const nrPlayers = players.length;
  const byInt = (i: number): GeomPlayer => players.find((p) => p.playerInt === i)!;
  const byId = (id: string): GeomPlayer => players.find((p) => p.id === id)!;

  const cell = getCellDistance(nrPlayers, boardSize);
  const start = getStartPoint(nrPlayers, boardSize); // running point, mutated below
  const last = nrPlayers - 1;
  const tiles: Tile[] = [];

  // Base section: one section's worth of normal track tiles. Built from the
  // previous player's tiles 7..15 (j < 0) then player 0's tiles 0..6 (j >= 0).
  for (let j = -9; j < 7; j++) {
    const pInt = j < 0 ? last : 0;
    const tileNr = j < 0 ? j + 16 : j;
    tiles.push({ playerId: byInt(pInt).id, tileNr, x: round1(start.x), y: round1(start.y) });
    if (j < -3)
      start.y += cell; // down for 6 tiles
    else if (j < 1)
      start.x -= cell; // left for 4 tiles
    else start.y -= cell; // up for 5 tiles
  }

  const at = (pid: string, t: number): Tile =>
    tiles.find((m) => m.playerId === pid && m.tileNr === t)!;

  // Finish lane 16..19 (player 0), going up from the previous player's tile 15.
  let pt: Pt = { x: at(byInt(last).id, 15).x, y: at(byInt(last).id, 15).y };
  for (let i = 1; i <= 4; i++) {
    pt = { x: pt.x, y: pt.y - cell };
    tiles.push({ playerId: byInt(0).id, tileNr: 15 + i, x: round1(pt.x), y: round1(pt.y) });
  }

  // Nest tiles -1..-4 (player 0), near player 0's tile 1.
  const p0 = byInt(0).id;
  pt = { x: at(p0, 1).x, y: at(p0, 1).y };
  pt = { x: pt.x - 1.5 * cell, y: pt.y };
  tiles.push({ playerId: p0, tileNr: -1, x: round1(pt.x), y: round1(pt.y) });
  pt = { x: pt.x - cell, y: pt.y };
  tiles.push({ playerId: p0, tileNr: -2, x: round1(pt.x), y: round1(pt.y) });
  pt = { x: pt.x, y: pt.y - cell };
  tiles.push({ playerId: p0, tileNr: -3, x: round1(pt.x), y: round1(pt.y) });
  pt = { x: pt.x + cell, y: pt.y };
  tiles.push({ playerId: p0, tileNr: -4, x: round1(pt.x), y: round1(pt.y) });

  // Rotate the base section to produce every other player's section.
  const base = [...tiles];
  for (const tile of base) {
    for (let k = 1; k < nrPlayers; k++) {
      const colorInt = (byId(tile.playerId).playerInt + k) % nrPlayers;
      const r = rotate({ x: tile.x, y: tile.y }, CENTER, (360 / nrPlayers) * k);
      tiles.push({ playerId: byInt(colorInt).id, tileNr: tile.tileNr, x: r.x, y: r.y });
    }
  }

  // Rotate the whole board so the viewer's section is at the bottom.
  const viewerInt = byId(viewerPlayerId).playerInt;
  const rotated = tiles.map((tile) => {
    const r = rotate({ x: tile.x, y: tile.y }, CENTER, (-360 / nrPlayers) * viewerInt);
    return { ...tile, x: r.x, y: r.y };
  });

  // Card-deck segment per player — the line just below a section's tiles where
  // that player's hand fans out. Port of Board.createBoard's cardsDeckPoints:
  // build player 0's [begin, end] from tile 1 and the previous player's tile 13
  // (shifted a row down), rotate it per player, then orient for the viewer.
  const deckBegin: Pt = { x: at(p0, 1).x, y: at(p0, 1).y + cell + 3 };
  const deckEnd: Pt = { x: at(byInt(last).id, 13).x, y: at(byInt(last).id, 13).y + cell + 3 };
  const viewerRot = (-360 / nrPlayers) * viewerInt;
  const deckPoints = new Map<string, [Pt, Pt]>();
  for (let k = 0; k < nrPlayers; k++) {
    const kRot = (360 / nrPlayers) * k;
    const b = rotate(rotate(deckBegin, CENTER, kRot), CENTER, viewerRot);
    const e = rotate(rotate(deckEnd, CENTER, kRot), CENTER, viewerRot);
    deckPoints.set(byInt(k).id, [b, e]);
  }

  return {
    tiles: rotated,
    cellDistance: cell,
    position: (playerId, tileNr) => {
      const m = rotated.find((t) => t.playerId === playerId && t.tileNr === tileNr);
      return m ? { x: m.x, y: m.y } : undefined;
    },
    deckSegment: (playerId) => deckPoints.get(playerId),
  };
}

/**
 * Fan `nrCards` card-back positions along a player's deck `segment`, ported from
 * the GWT drawCardsIcons: pivot a point out beyond the board, then spread the
 * cards on an arc facing the centre. Returns each card's centre + rotation (deg).
 * The spread scales with the count (full spread at 5 cards) so it never gaps.
 */
export function fanCardBacks(
  [start, end]: [Pt, Pt],
  nrCards: number,
): { x: number; y: number; rotDeg: number }[] {
  if (nrCards <= 0) return [];
  const rawMidX = (start.x + end.x) / 2;
  const rawMidY = (start.y + end.y) / 2;
  const radX = rawMidX - CENTER.x;
  const radY = rawMidY - CENTER.y;
  const radLen = Math.sqrt(radX * radX + radY * radY);
  if (radLen < 1) return [];
  const radNx = radX / radLen;
  const radNy = radY / radLen;

  const midX = rawMidX + radNx * 40; // push the fan clear of the tiles
  const midY = rawMidY + radNy * 40;
  const pivotDist = 120;
  const pivotX = midX + radNx * pivotDist;
  const pivotY = midY + radNy * pivotDist;

  const fullSpreadW = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
  const scaledSpreadW = (fullSpreadW * Math.max(0, nrCards - 1)) / 4;
  const halfFan = Math.atan2(scaledSpreadW / 2, pivotDist);
  const fanRadius = Math.sqrt(pivotDist * pivotDist + (scaledSpreadW / 2) ** 2);
  const baseDir = Math.atan2(CENTER.y - pivotY, CENTER.x - pivotX);

  const out: { x: number; y: number; rotDeg: number }[] = [];
  for (let i = 0; i < nrCards; i++) {
    const t = nrCards <= 1 ? 0 : i / (nrCards - 1);
    const cardAngle = baseDir - halfFan + t * 2 * halfFan;
    out.push({
      x: pivotX + fanRadius * Math.cos(cardAngle),
      y: pivotY + fanRadius * Math.sin(cardAngle),
      rotDeg: ((cardAngle + Math.PI / 2) * 180) / Math.PI,
    });
  }
  return out;
}

/** Tile circle diameter in px (matches createCircle: 2 * (cell / 2) - 3). */
export function tileDiameter(cellDistance: number): number {
  return cellDistance - 3;
}

/**
 * Top-left position + z-index for a PAWN_SIZE pawn whose tile centre is `p`.
 * Matches PawnLayout: left = x - 25, top = y - 25 - 15, z-index = y.
 */
export function pawnBox(p: Pt): { left: number; top: number; zIndex: number } {
  return { left: p.x - PAWN_SIZE / 2, top: p.y - PAWN_SIZE / 2 - 15, zIndex: Math.round(p.y) };
}
