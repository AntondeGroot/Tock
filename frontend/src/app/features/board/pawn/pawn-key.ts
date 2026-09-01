import { PawnId } from '../../../api';

/**
 * The string key identifying a pawn's DOM/animation element, in the format
 * "playerId:pawnNr" (e.g. "2:0"). The animation position map is keyed with this,
 * and lookups must use the exact same string or the pawn won't animate.
 *
 * Port of the GWT PawnClient.getPawnId regression guard (PawnAnimationKeyTest):
 * GWT keyed with "playerId_pawnNr"; Angular uses ":" as the separator.
 */
export function pawnKey(pawnId: PawnId): string {
  return `${pawnId.playerId}:${pawnId.pawnNr}`;
}
