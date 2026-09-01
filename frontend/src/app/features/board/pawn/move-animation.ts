import { MoveResponse, Pawn as ApiPawn, PositionKey } from '../../../api';
import { BoardGeometry, Pt } from '../geometry/board-geometry';
import { PawnWalk, walkDurationMs } from './pawn-animator';
import { pawnKey } from './pawn-key';

// Pure projection from (board geometry + a server move) to the animation the board plays. Kept out
// of the component so it can be unit-tested with plain inputs — no signals, no DI.

/** A move's pawns as ONE group (they move together), plus when each capture lands. */
export interface MoveAnimation {
  walks: PawnWalk[];
  /** Ms into the group at which pawn1's / pawn2's victim starts flying home (for the sound). */
  killDelay1: number;
  killDelay2: number;
}

/** A pawn's tile path as the pixel waypoints the animator walks; undefined when it isn't moving. */
function pawnWalk(
  g: BoardGeometry,
  pawn: ApiPawn | undefined,
  move: PositionKey[] | undefined,
  delayMs = 0,
): PawnWalk | undefined {
  if (!pawn || !move) return undefined;
  const points: Pt[] = [];
  for (const t of move) {
    const p = g.position(t.playerId, t.tileNr);
    if (p) points.push(p);
  }
  return { id: pawnKey(pawn.pawnId), points, delayMs };
}

/**
 * The whole move as one animation group: the moved pawn(s) set off together — a Jack switch swaps
 * both at once — and a captured pawn is flung home as its killer arrives on its tile.
 */
export function moveAnimation(g: BoardGeometry, mr: MoveResponse): MoveAnimation {
  const pawn1 = pawnWalk(g, mr.pawn1, mr.movePawn1);
  const pawn2 = pawnWalk(g, mr.pawn2, mr.movePawn2);
  const killDelay1 = pawn1 ? walkDurationMs(pawn1.points) : 0;
  const killDelay2 = pawn2 ? walkDurationMs(pawn2.points) : 0;
  const walks = [
    pawn1,
    pawn2,
    pawnWalk(g, mr.pawnKilledByPawn1, mr.movePawnKilledByPawn1, killDelay1),
    pawnWalk(g, mr.pawnKilledByPawn2, mr.movePawnKilledByPawn2, killDelay2),
  ].filter((w): w is PawnWalk => w !== undefined);
  return { walks, killDelay1, killDelay2 };
}
