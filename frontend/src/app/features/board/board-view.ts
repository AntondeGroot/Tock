import { Pawn as ApiPawn, Player } from '../../api';
import { CardBackVM } from '../../card-table/card-table.types';
import { seatColor } from '../../player-colors';
import { BoardGeometry, fanCardBacks, Pt, Tile } from './geometry/board-geometry';
import { PawnPos } from './pawn/pawn-animator';
import { pawnKey } from './pawn/pawn-key';

// Pure projections from (board geometry + server state) to the view models the board renders.
// Kept out of the component so they can be unit-tested with plain inputs — no signals, no DI.

const BOARD_CENTER = 300; // px centre of the 600px board
const DECK_CENTER = { x: 315, y: 300 }; // where dealt backs stack before they fan out
const DEAL_ROUND_MS = 700; // deal stagger per card round (mirrors CardTable's dealStaggerMs)
const DEAL_SEAT_MS = 350; // extra per-seat offset within a round (clockwise from the viewer)
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

/**
 * Face-down card backs for every OTHER player, fanned by their public card count (only counts are
 * known — never values — so there's nothing to peek at). During a deal they start stacked at the
 * deck and fan out, staggered clockwise from the viewer — the same FLIP as the viewer's own cards.
 * Positions are in the card-layer's %-space (board px / 6), like the hand + pile.
 */
export function projectCardBacks(
  g: BoardGeometry,
  counts: Record<string, number>,
  viewerId: string | null | undefined,
  dealing: boolean,
  atDeck: boolean,
): CardBackVM[] {
  const mid = (seg: [Pt, Pt]) => ({ x: (seg[0].x + seg[1].x) / 2, y: (seg[0].y + seg[1].y) / 2 });
  const vSeg = viewerId ? g.deckSegment(viewerId) : undefined;
  const vm = vSeg ? mid(vSeg) : { x: BOARD_CENTER, y: 2 * BOARD_CENTER }; // fallback: bottom seat
  const viewerAngle = Math.atan2(vm.y - BOARD_CENTER, vm.x - BOARD_CENTER);

  // Order opponents by their angle around the board centre, clockwise from the viewer (in screen
  // coords, clockwise = increasing atan2), so the deal sweeps around the table.
  const opponents = Object.keys(counts)
    .filter((pid) => pid !== viewerId && g.deckSegment(pid))
    .map((pid) => {
      const m = mid(g.deckSegment(pid)!);
      const cw =
        (Math.atan2(m.y - BOARD_CENTER, m.x - BOARD_CENTER) - viewerAngle + 2 * Math.PI) %
        (2 * Math.PI);
      return { pid, cw };
    })
    .sort((a, b) => a.cw - b.cw);

  const backs: CardBackVM[] = [];
  opponents.forEach(({ pid }, oi) => {
    const seat = oi + 1; // the viewer is seat 0; opponents take the next seats clockwise
    fanCardBacks(g.deckSegment(pid)!, counts[pid]).forEach((c, i) => {
      // Round-robin: i = round (card index), seat = offset within the round.
      const dealDelay = dealing ? i * DEAL_ROUND_MS + seat * DEAL_SEAT_MS : 0;
      backs.push({
        key: `${pid}:${i}`,
        x: (atDeck ? DECK_CENTER.x : c.x) / 6,
        y: (atDeck ? DECK_CENTER.y : c.y) / 6,
        rot: atDeck ? 0 : c.rotDeg,
        dealDelay,
        // Sooner-flying backs sit on top of the deck stack (taken off the top).
        z: dealing ? 400 - Math.round(dealDelay / 20) : undefined,
      });
    });
  });
  return backs;
}
