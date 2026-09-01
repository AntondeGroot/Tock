import { MoveRejectionReason } from '../../../api';
import { TranslationKey } from '../../../i18n/translations';

/**
 * Maps a server move-rejection reason to its i18n key (ported from the GWT
 * presenter's rejectionMessage switch). `MUST_MOVE_EXACT_STEPS` carries a numeric
 * `rejectionDetail` that fills the message's %s. Unknown/undefined → generic.
 */
/**
 * Some selections the client allows are structurally invalid on the server, which
 * rejects them with a bare 400 (no reason). Derive the right message locally so we
 * explain the real problem instead of the misleading "not your turn". Returns null
 * when the selection is worth sending to the server. (tileNr < 0 == nest.)
 */
export function localRejectionKey(pawn1TileNr: number, cardValue: number): TranslationKey | null {
  const onNest = pawn1TileNr < 0;
  const isAceOrKing = cardValue === 1 || cardValue === 13;
  // A pawn in the nest can only come out with an Ace or King.
  if (onNest && !isAceOrKing) return 'moveRejectedPawnOnNest';
  // A King only brings a pawn out of the nest; it can't move one already on the board.
  if (!onNest && cardValue === 13) return 'moveRejectedPawnNotOnNest';
  return null;
}

export function rejectionMessageKey(reason: MoveRejectionReason | undefined): TranslationKey {
  switch (reason) {
    case 'INVALID_SELECTION':
      return 'moveRejectedInvalidSelection';
    case 'DONT_HAVE_CARD':
      return 'moveRejectedDontHaveCard';
    case 'WRONG_CARD_FOR_MOVE':
      return 'moveRejectedWrongCardForMove';
    case 'PAWN_ON_NEST':
      return 'moveRejectedPawnOnNest';
    case 'PAWN_NOT_ON_NEST':
      return 'moveRejectedPawnNotOnNest';
    case 'PAWN_NOT_ON_BOARD':
      return 'moveRejectedPawnNotOnBoard';
    case 'NOT_YOUR_PAWN':
      return 'moveRejectedNotYourPawn';
    case 'DESTINATION_OCCUPIED_BY_OWN_PAWN':
      return 'moveRejectedDestinationOccupiedByOwnPawn';
    case 'DESTINATION_BLOCKED':
      return 'moveRejectedDestinationBlocked';
    case 'START_TILE_OCCUPIED':
      return 'moveRejectedStartTileOccupied';
    case 'CANNOT_PASS_START_TILE':
      return 'moveRejectedCannotPassStartTile';
    case 'CANNOT_SWITCH_OPPONENT_ON_OWN_START':
      return 'moveRejectedCannotSwitchOpponentOnOwnStart';
    case 'CANNOT_SWITCH_OWN_PAWNS':
      return 'moveRejectedCannotSwitchOwnPawns';
    case 'MUST_MOVE_EXACT_STEPS':
      return 'moveRejectedMustMoveExactSteps';
    case 'PAWN_CLOSED_IN_FINISH':
      return 'moveRejectedPawnClosedInFinish';
    case 'SPLIT_NEEDS_TWO_OWN_PAWNS':
      return 'moveRejectedSplitNeedsTwoOwnPawns';
    case 'SPLIT_STEPS_NOT_SEVEN':
      return 'moveRejectedSplitStepsNotSeven';
    case 'MUST_FINISH_OWN_PAWNS_FIRST':
      return 'moveRejectedMustFinishOwnPawnsFirst';
    case 'CANNOT_MOVE_OUT_OF_FINISH':
      return 'moveRejectedCannotMoveOutOfFinish';
    default:
      return 'moveRejectedGeneric';
  }
}
