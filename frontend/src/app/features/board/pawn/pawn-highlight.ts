import { Player } from '../../../api';
import { seatColor } from '../../../player-colors';

/**
 * Selection-highlight colours for a pawn — a faithful port of the GWT
 * PawnHighlightColors. Pawn 1 prefers red, pawn 2 prefers green; either falls
 * back to blue if it would clash (be too close in hue) with the pawn's own colour.
 */
export const RED = '#ef5350';
export const GREEN = '#66bb6a';
export const BLUE = '#1e90ff';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function computeHue([r, g, b]: [number, number, number]): number {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  return hue < 0 ? hue + 360 : hue;
}

export function clashes(pawnColor: string | undefined, highlight: string): boolean {
  if (!pawnColor) return false;
  let diff = Math.abs(computeHue(hexToRgb(pawnColor)) - computeHue(hexToRgb(highlight)));
  if (diff > 180) diff = 360 - diff;
  return diff < 40;
}

export function highlightForPawn1(pawnColor: string | undefined): string {
  return clashes(pawnColor, RED) ? BLUE : RED;
}

export function highlightForPawn2(pawnColor: string | undefined): string {
  return clashes(pawnColor, GREEN) ? BLUE : GREEN;
}

/**
 * The step-box (label + border) colour for the selected pawn `pawnId` ("playerId:pawnNr"), matching
 * that pawn's board highlight — which itself depends on the pawn's own seat colour. `which` picks
 * pawn 1's (red-ish) or pawn 2's (green-ish) highlight. Undefined when no pawn is selected.
 */
export function stepBoxColor(
  pawnId: string | null | undefined,
  players: Player[],
  which: 1 | 2,
): string | undefined {
  if (!pawnId) return undefined;
  const pawnColor = seatColor(players.find((p) => p.id === pawnId.split(':')[0])?.playerInt);
  return which === 1 ? highlightForPawn1(pawnColor) : highlightForPawn2(pawnColor);
}
