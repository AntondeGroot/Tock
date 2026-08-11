import { Pawn, Player } from '../../api';

/** The finish lane is tiles 16-19, so a pawn standing on one of them is home. */
const FIRST_FINISH_TILE = 16;

/**
 * Who may play whose pawns in team play. In the second phase of a team game you play your
 * teammate's pawns once all of your own are home — but only while they still have one out: when
 * you are the last of the team to come home the team has finished, and there is nothing to take
 * over. The backend enforces the same rule (GameState.mayControlTeammatePawn).
 */

/** The viewer's teammate, or undefined when teams are off or nobody shares their team. */
export function teammateOf(
  players: Player[] | undefined,
  viewerId: string | null | undefined,
): Player | undefined {
  const teamId = viewerId ? players?.find((p) => p.id === viewerId)?.teamId : undefined;
  if (teamId == null) return undefined;
  return players?.find((p) => p.id !== viewerId && p.teamId === teamId);
}

/** Are all of this player's pawns home? False for a player without pawns (or no player at all). */
export function allPawnsHome(
  pawns: Pawn[] | undefined,
  playerId: string | null | undefined,
): boolean {
  if (!playerId) return false;
  const own = (pawns ?? []).filter((p) => p.playerId === playerId);
  return own.length > 0 && own.every((p) => (p.currentTileId?.tileNr ?? -1) >= FIRST_FINISH_TILE);
}
