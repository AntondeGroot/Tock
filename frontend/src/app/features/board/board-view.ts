import { Pawn as ApiPawn, Player } from '../../api';
import { seatColor } from '../../player-colors';
import { BoardGeometry, Tile } from './geometry/board-geometry';
import { PawnPos } from './pawn/pawn-animator';
import { pawnKey } from './pawn/pawn-key';

// Pure projections from (board geometry + server state) to the view models the board renders.
// Kept out of the component so they can be unit-tested with plain inputs — no signals, no DI.

const NEUTRAL_TILE = '#f2f2f2'; // the shared track; home/finish tiles take the seat colour

/** A board tile plus the colour it renders in. */
export interface TileVM extends Tile {
  color: string;
}

/** A pawn placed for rendering: pixel position, stacking, seat colour, team + move duration. */
export interface PawnVM {
  id: string;
  x: number;
  y: number;
  zIndex: number;
  color: string;
  teamId: number | null;
  moveMs: number;
}

/** Colour each player's home/finish tiles by seat; the shared track stays neutral. */
export function projectTiles(g: BoardGeometry, players: Player[]): TileVM[] {
  const seatOf = (playerId: string) => players.find((p) => p.id === playerId);
  const emptySeat = (playerId: string) => seatOf(playerId)?.placeholder === true;
  // The tiles a seat owns: its nest (negative), its start tile (0) and its finish lane (16+).
  // Everything between is the shared track that all pawns travel.
  const ownTile = (tileNr: number) => tileNr <= 0 || tileNr >= 16;
  return (
    g.tiles
      // An empty seat is board to cross, not somewhere to live: no nest and no finish lane, only
      // the track — its start tile included, which no one owns and every pawn passes over.
      .filter((t) => !emptySeat(t.playerId) || (t.tileNr >= 0 && t.tileNr < 16))
      .map((t) => ({
        ...t,
        color:
          ownTile(t.tileNr) && !emptySeat(t.playerId)
            ? seatColor(seatOf(t.playerId)?.playerInt)
            : NEUTRAL_TILE,
      }))
  );
}

/**
 * Place each pawn: while it's moving, its position (and step duration) comes from the `anim`
 * override instead of the server's already-final tile. Pawns whose tile has no geometry drop out.
 */
export function projectPawns(
  g: BoardGeometry,
  pawns: ApiPawn[],
  players: Player[],
  anim: Map<string, PawnPos>,
): PawnVM[] {
  const playerOf = (playerId: string) => players.find((p) => p.id === playerId);
  const colorOf = (playerId: string) => seatColor(playerOf(playerId)?.playerInt);
  const teamOf = (playerId: string) => playerOf(playerId)?.teamId ?? null;
  return pawns
    .map((pawn): PawnVM | null => {
      const id = pawnKey(pawn.pawnId);
      const a = anim.get(id);
      let x: number, y: number;
      if (a) {
        x = a.x;
        y = a.y;
      } else {
        const tile = pawn.currentTileId;
        const pt = g.position(tile.playerId, tile.tileNr);
        if (!pt) return null;
        x = pt.x;
        y = pt.y;
      }
      return {
        id,
        x,
        y,
        zIndex: Math.round(y),
        color: colorOf(pawn.playerId),
        teamId: teamOf(pawn.playerId),
        moveMs: a?.ms ?? 0,
      };
    })
    .filter((p): p is PawnVM => p !== null);
}
