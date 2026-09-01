import { MoveRequest, PawnId } from '../../../api';
import { PawnAndCardSelection } from './pawn-and-card-selection';

/**
 * Resolves a selection pawn key ("playerId:pawnNr") to the server's pawn, which carries the
 * structured `pawnId` a move request is addressed with. Undefined when the board no longer knows
 * that pawn — a selection can outlive the push it was made against.
 */
export type PawnLookup = (id: string) => { pawnId: PawnId } | undefined;

/**
 * Assemble a (card + pawn) selection into a MoveRequest, or undefined when it isn't yet a
 * complete, resolvable move: no card, no first pawn, no viewer, or a pawn the current state no
 * longer knows. Shared by the live preview (CHECK_MOVE) and the actual play (MAKE_MOVE) — both
 * send the same pieces, and the server re-derives the move type from them.
 */
export function buildMoveRequest(
  selection: PawnAndCardSelection,
  viewerId: string | null,
  findPawn: PawnLookup,
  tempMessageType: MoveRequest['tempMessageType'],
): MoveRequest | undefined {
  const card = selection.getCard();
  const pawn1 = selection.getPawn1();
  if (!card || !pawn1 || !viewerId) return undefined;

  const apiPawn1 = findPawn(pawn1.id);
  if (!apiPawn1) return undefined;

  const pawn2Id = selection.getPawn2()?.id;
  return {
    playerId: viewerId,
    cardId: card.id,
    pawn1Id: apiPawn1.pawnId,
    pawn2Id: pawn2Id ? findPawn(pawn2Id)?.pawnId : undefined,
    stepsPawn1: selection.getNrStepsPawn1(),
    stepsPawn2: selection.getNrStepsPawn2(),
    tempMessageType,
  };
}
